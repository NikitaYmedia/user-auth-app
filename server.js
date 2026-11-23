require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Resend } = require("resend");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const pool = require("./db");
const { uptime } = require("process");

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_MS = 1000 * 60 * 60;
const ADMIN_REMEMBER_MS = 1000 * 60 * 60 * 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (IS_PRODUCTION) {
    app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
});

const SESSION_COOKIE = "auto.sid";

app.use(
    session({
        name: SESSION_COOKIE,
        store: new pgSession({ pool, createTableIfMissing: true }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax",
            maxAge: SESSION_MS
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
    schemaReady.then(() => next());
});

const events = [];

function logEvent(type, title, detail = "", source = "App") {
    events.unshift({
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        type,
        title,
        detail,
        source
    });

    if (events.length > 100) {
        events.pop();
    }
}

function safeEqual(a, b) {
    const hashA = crypto.createHash("sha256").update(String(a)).digest();
    const hashB = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

function validatePassword(password) {
    if (typeof password !== "string" || password.length < 8) {
        return "Password must be at least 8 characters long.";
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
        return "Password must not exceed 72 bytes.";
    }

    return null;
}

function requireUser(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ message: "Please log in." });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) {
        return res.status(403).json({ message: "Access denied." });
    }

    next();
}

function parseId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function destroySession(req, res, callback) {
    req.session.destroy((error) => {
        if (error) {
            return callback(error);
        }

        res.clearCookie(SESSION_COOKIE, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax"
        });

        callback(null);
    });
}

function regenerateSession(req, values, remember, callback) {
    req.session.regenerate((error) => {
        if (error) {
            return callback(error);
        }

        Object.assign(req.session, values);

        if (remember) {
            req.session.cookie.maxAge = ADMIN_REMEMBER_MS;
        }

        req.session.save(callback);
    });
}

async function withTransaction(work) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function deleteUserById(userId) {
    return withTransaction(async (client) => {
        await client.query(
            "DELETE FROM password_reset_tokens WHERE user_id = $1",
            [userId]
        );
        await client.query(
            "DELETE FROM admin_requests WHERE user_id = $1",
            [userId]
        );

        const result = await client.query(
            "DELETE FROM users WHERE id = $1 RETURNING id, email",
            [userId]
        );

        return result.rows[0] || null;
    });
}

async function sendPasswordResetEmail(userId, email) {
    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
        `UPDATE password_reset_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
    );

    await pool.query(
        `INSERT INTO password_reset_tokens
         (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
    );

    const baseUrl =
        process.env.APP_URL ||
        (IS_PRODUCTION ? null : `http://localhost:${PORT}`);

    if (!baseUrl) {
        throw new Error("APP_URL environment variable is missing.");
    }

    const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;

    const { error: emailError } = await resend.emails.send({
        from: "Your App <onboarding@resend.dev>",
        to: [email],
        subject: "Reset your password",
        html: `
            <h2>Reset your password</h2>
            <p>We received a request to reset your password.</p>
            <p><a href="${resetUrl}">Reset password</a></p>
            <p>This link expires in 15 minutes.</p>
            <p>If you did not request this, you can ignore this email.</p>
        `
    });

    if (emailError) {
        throw new Error("Email delivery failed.");
    }
}

async function ensureSchema() {
    try {
        const sql = fs.readFileSync(
            path.join(__dirname, "schema.sql"),
            "utf8"
        );
        await pool.query(sql);
        console.log("Database schema is up to date.");
    } catch (error) {
        console.error("Schema migration failed:", error.message);
    }
}

app.get("/", (req, res) => {
    res.redirect("/login.html");
});

app.post("/register", async (req, res) => {
    let { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    email = email.trim().toLowerCase();

    if (email.length > 255 || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }

    try {
        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        await pool.query(
            `INSERT INTO users (email, password_hash, password_updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            [email, passwordHash]
        );

        logEvent("success", "New user registered", email, "Auth");

        return res.status(201).json({
            message: "Registration successful!"
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        return res.status(500).json({
            message: "Registration failed. Please try again."
        });
    }
});

app.post("/login", async (req, res) => {
    let { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    email = email.trim().toLowerCase();

    if (email.length > 255) {
        return res.status(401).json({
            message: "Invalid email or password."
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, email, password_hash
             FROM users
             WHERE email = $1`,
            [email]
        );

        const user = result.rows[0];

        const passwordMatches = user
            ? await bcrypt.compare(password, user.password_hash)
            : false;

        if (!passwordMatches) {
            logEvent("warning", "Failed user login", email, "Auth");

            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        regenerateSession(
            req,
            { userId: user.id, userEmail: user.email },
            false,
            (error) => {
                if (error) {
                    console.error("Session error:", error.message);

                    return res.status(500).json({
                        message: "Login failed. Please try again."
                    });
                }

                logEvent("info", "User signed in", user.email, "Auth");

                return res.status(200).json({
                    message: "Login successful!"
                });
            }
        );
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
});

app.post("/logout", (req, res) => {
    destroySession(req, res, (error) => {
        if (error) {
            console.error("Logout error:", error.message);

            return res.status(500).json({
                message: "Could not log out."
            });
        }

        return res.status(200).json({
            message: "Logged out successfully."
        });
    });
});

app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body || {};

    if (
        typeof email !== "string" ||
        !email.trim() ||
        email.trim().length > 255 ||
        !EMAIL_REGEX.test(email.trim())
    ) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    const responseMessage =
        "If an account with that email exists, reset instructions will be sent.";

    try {
        const normalizedEmail = email.trim().toLowerCase();

        const result = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({ message: responseMessage });
        }

        await sendPasswordResetEmail(result.rows[0].id, normalizedEmail);

        logEvent("info", "Password reset requested", normalizedEmail, "Auth");

        return res.status(200).json({ message: responseMessage });
    } catch (error) {
        console.error("Password reset request failed:", error.message);

        return res.status(500).json({
            message: "Unable to process your request. Please try again."
        });
    }
});

app.post("/api/reset-password", async (req, res) => {
    const { token, password } = req.body || {};

    if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token) ||
        validatePassword(password)
    ) {
        return res.status(400).json({
            message: "Invalid token or password. Use at least 8 characters."
        });
    }

    try {
        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const passwordHash = await bcrypt.hash(password, 10);

        const userId = await withTransaction(async (client) => {
            const updated = await client.query(
                `UPDATE password_reset_tokens
                 SET used_at = CURRENT_TIMESTAMP
                 WHERE token_hash = $1
                   AND used_at IS NULL
                   AND expires_at > CURRENT_TIMESTAMP
                 RETURNING user_id`,
                [tokenHash]
            );

            if (updated.rows.length === 0) {
                return null;
            }

            await client.query(
                `UPDATE users
                 SET password_hash = $1,
                     password_updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [passwordHash, updated.rows[0].user_id]
            );

            return updated.rows[0].user_id;
        });

        if (!userId) {
            return res.status(400).json({
                message: "This reset link is invalid or has expired."
            });
        }

        logEvent("success", "Password reset completed", `User ID ${userId}`, "Auth");

        return res.status(200).json({
            message: "Password reset successful! You can now sign in."
        });
    } catch (error) {
        console.error("Password reset error:", error.message);

        return res.status(500).json({
            message: "Unable to reset password. Please try again."
        });
    }
});

app.get("/account", requireUser, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, email, created_at, password_updated_at, is_admin
             FROM users
             WHERE id = $1`,
            [req.session.userId]
        );

        const user = userResult.rows[0];

        if (!user) {
            return destroySession(req, res, () =>
                res.status(401).json({ message: "Please log in." })
            );
        }

        const requestResult = await pool.query(
            `SELECT status, reason, created_at
             FROM admin_requests
             WHERE user_id = $1
             ORDER BY id DESC
             LIMIT 1`,
            [user.id]
        );

        const adminRequest = requestResult.rows[0];

        return res.status(200).json({
            id: user.id,
            email: user.email,
            createdAt: user.created_at,
            passwordUpdatedAt: user.password_updated_at || user.created_at,
            isAdmin: user.is_admin,
            adminRequest: adminRequest
                ? {
                      status: adminRequest.status,
                      reason: adminRequest.reason,
                      createdAt: adminRequest.created_at
                  }
                : null
        });
    } catch (error) {
        console.error("Account error:", error.message);

        return res.status(500).json({
            message: "Unable to load your account."
        });
    }
});

async function verifyCurrentPassword(userId, password) {
    if (typeof password !== "string" || !password) {
        return false;
    }

    const result = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId]
    );

    return result.rows[0]
        ? bcrypt.compare(password, result.rows[0].password_hash)
        : false;
}

app.patch("/api/account/email", requireUser, async (req, res) => {
    let { email, password } = req.body || {};

    if (typeof email !== "string") {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    email = email.trim().toLowerCase();

    if (email.length > 255 || !EMAIL_REGEX.test(email)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    try {
        if (!(await verifyCurrentPassword(req.session.userId, password))) {
            return res.status(401).json({
                message: "Current password is incorrect."
            });
        }

        await pool.query(
            "UPDATE users SET email = $1 WHERE id = $2",
            [email, req.session.userId]
        );

        req.session.userEmail = email;

        logEvent("info", "Email address changed", email, "Account");

        return res.status(200).json({
            message: "Email updated.",
            email
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        console.error("Email change error:", error.message);

        return res.status(500).json({
            message: "Unable to update email."
        });
    }
});

app.post("/api/account/password", requireUser, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    const passwordError = validatePassword(newPassword);

    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }

    try {
        if (!(await verifyCurrentPassword(req.session.userId, currentPassword))) {
            return res.status(401).json({
                message: "Current password is incorrect."
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await pool.query(
            `UPDATE users
             SET password_hash = $1,
                 password_updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [passwordHash, req.session.userId]
        );

        logEvent("info", "Password changed", req.session.userEmail, "Account");

        return res.status(200).json({ message: "Password updated." });
    } catch (error) {
        console.error("Password change error:", error.message);

        return res.status(500).json({
            message: "Unable to update password."
        });
    }
});

app.post("/api/account/admin-request", requireUser, async (req, res) => {
    const reason =
        typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (reason.length < 10 || reason.length > 500) {
        return res.status(400).json({
            message: "Please describe your reason (10–500 characters)."
        });
    }

    try {
        const userResult = await pool.query(
            "SELECT is_admin FROM users WHERE id = $1",
            [req.session.userId]
        );

        if (userResult.rows[0]?.is_admin) {
            return res.status(409).json({
                message: "Your account already has admin access."
            });
        }

        await pool.query(
            "INSERT INTO admin_requests (user_id, reason) VALUES ($1, $2)",
            [req.session.userId, reason]
        );

        logEvent(
            "warning",
            "Admin access requested",
            req.session.userEmail,
            "Account"
        );

        return res.status(201).json({
            message: "Request sent. An administrator will review it."
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                message: "You already have a pending request."
            });
        }

        console.error("Admin request error:", error.message);

        return res.status(500).json({
            message: "Unable to send your request."
        });
    }
});

app.delete("/api/account", requireUser, async (req, res) => {
    try {
        if (!(await verifyCurrentPassword(req.session.userId, req.body?.password))) {
            return res.status(401).json({
                message: "Password is incorrect."
            });
        }

        const deleted = await deleteUserById(req.session.userId);

        logEvent(
            "warning",
            "Account deleted by owner",
            deleted?.email || "",
            "Account"
        );

        destroySession(req, res, () =>
            res.status(200).json({ message: "Account deleted." })
        );
    } catch (error) {
        console.error("Account deletion error:", error.message);

        return res.status(500).json({
            message: "Unable to delete account."
        });
    }
});

async function verifyAdminCredentials(email, password) {
    if (
        ADMIN_EMAIL &&
        ADMIN_PASSWORD &&
        safeEqual(email, ADMIN_EMAIL) &&
        safeEqual(password, ADMIN_PASSWORD)
    ) {
        return { email: ADMIN_EMAIL, userId: null, root: true };
    }

    const result = await pool.query(
        `SELECT id, email, password_hash
         FROM users
         WHERE email = $1 AND is_admin = TRUE`,
        [email]
    );

    const user = result.rows[0];

    if (user && (await bcrypt.compare(password, user.password_hash))) {
        return { email: user.email, userId: user.id, root: false };
    }

    return null;
}

app.post("/admin-login", async (req, res) => {
    const { email, password, remember } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    try {
        const admin = await verifyAdminCredentials(
            email.trim().toLowerCase(),
            password
        );

        if (!admin) {
            logEvent("warning", "Failed admin login", email.trim(), "Admin");

            return res.status(401).json({
                message: "Invalid administrator credentials."
            });
        }

        regenerateSession(
            req,
            {
                isAdmin: true,
                adminEmail: admin.email,
                adminUserId: admin.userId,
                adminRoot: admin.root
            },
            remember === true,
            (error) => {
                if (error) {
                    console.error("Admin session error:", error.message);

                    return res.status(500).json({
                        message: "Login failed. Please try again."
                    });
                }

                logEvent("info", "Administrator signed in", admin.email, "Admin");

                return res.status(200).json({
                    message: "Administrator login successful!"
                });
            }
        );
    } catch (error) {
        console.error("Admin login error:", error.message);

        return res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
});

app.post("/admin-logout", (req, res) => {
    destroySession(req, res, (error) => {
        if (error) {
            console.error("Admin logout error:", error.message);

            return res.status(500).json({
                message: "Could not log out."
            });
        }

        return res.status(200).json({
            message: "Logged out successfully."
        });
    });
});

app.get("/api/admin/me", requireAdmin, async (req, res) => {
    try {
        const pending = await pool.query(
            "SELECT COUNT(*)::int AS count FROM admin_requests WHERE status = 'pending'"
        );

        return res.status(200).json({
            email: req.session.adminEmail,
            root: Boolean(req.session.adminRoot),
            pendingRequests: pending.rows[0].count,
            environment: process.env.NODE_ENV || "development",
            region:
                process.env.VERCEL_REGION ||
                process.env.AWS_REGION ||
                "local"
        });
    } catch (error) {
        console.error("Admin me error:", error.message);

        return res.status(500).json({ message: "Unable to load admin data." });
    }
});

app.get("/api/admin/date", requireAdmin, (req, res) => {
    const now = new Date();

    return res.status (200).json({
        iso: now.toISOString(),
        local: now.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
});

app.get("/api/admin/uptime", requireAdmin, (req, res) => {
    const totalSecond = Math.floor(process.uptime());

    const days = Math.floor(totalSecond / 86400);
    const hours = Math.floor((totalSecond % 86400) / 3600);
    const minutes = Math.floor((totalSecond % 3600) / 60);
    const second = totalSecond % 60;

    return res.status(200).json({
        uptimeSeconds: totalSecond,
        formatted: `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`
    });
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, is_admin,
                    password_hash IS NOT NULL AS password_set
             FROM users
             ORDER BY id DESC`
        );

        const users = result.rows;
        const withPassword = users.filter((user) => user.password_set).length;

        return res.status(200).json({
            total: users.length,
            verifiedPercent: users.length
                ? Math.round((withPassword / users.length) * 100)
                : 100,
            users: users.map(({ id, email, is_admin }) => ({
                id,
                email,
                isAdmin: is_admin
            }))
        });
    } catch (error) {
        console.error("Admin users error:", error.message);

        return res.status(500).json({ message: "Unable to load users." });
    }
});

app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);

    if (!userId) {
        return res.status(400).json({ message: "Invalid user ID." });
    }

    try {
        const result = await pool.query(
            `SELECT
                id,
                email,
                created_at,
                is_admin,
                password_hash IS NOT NULL AS password_set
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error("Admin user profile error:", error.message);

        return res.status(500).json({
            message: "Unable to load user profile."
        });
    }
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);

    if (!userId) {
        return res.status(400).json({ message: "Invalid user ID." });
    }

    try {
        const result = await pool.query(
            "SELECT email FROM users WHERE id = $1",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        await sendPasswordResetEmail(userId, result.rows[0].email);

        logEvent(
            "info",
            "Reset link sent by admin",
            result.rows[0].email,
            "Admin"
        );

        return res.status(200).json({
            message: `Reset link sent to ${result.rows[0].email}.`
        });
    } catch (error) {
        console.error("Admin reset error:", error.message);

        return res.status(500).json({
            message: "Unable to send the reset link."
        });
    }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const userId = parseId(req.params.id);

    if (!userId) {
        return res.status(400).json({ message: "Invalid user ID." });
    }

    if (req.session.adminUserId === userId) {
        return res.status(400).json({
            message: "You cannot delete your own administrator account."
        });
    }

    try {
        const deleted = await deleteUserById(userId);

        if (!deleted) {
            return res.status(404).json({ message: "User not found." });
        }

        logEvent("warning", "User deleted by admin", deleted.email, "Admin");

        return res.status(200).json({
            message: "User deleted successfully."
        });
    } catch (error) {
        console.error("Admin user deletion error:", error.message);

        if (error.code === "23503") {
            return res.status(409).json({
                message: "This user has related records and cannot be deleted yet."
            });
        }

        return res.status(500).json({ message: "Unable to delete user." });
    }
});

app.get("/api/admin/requests", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.user_id, u.email, r.reason, r.status,
                    r.created_at, r.reviewed_at, r.reviewed_by
             FROM admin_requests r
             JOIN users u ON u.id = r.user_id
             ORDER BY (r.status = 'pending') DESC, r.created_at DESC
             LIMIT 100`
        );

        return res.status(200).json({
            requests: result.rows.map((row) => ({
                id: row.id,
                userId: row.user_id,
                email: row.email,
                reason: row.reason,
                status: row.status,
                createdAt: row.created_at,
                reviewedAt: row.reviewed_at,
                reviewedBy: row.reviewed_by
            }))
        });
    } catch (error) {
        console.error("Admin requests error:", error.message);

        return res.status(500).json({ message: "Unable to load requests." });
    }
});

async function reviewAdminRequest(req, res, decision) {
    const requestId = parseId(req.params.id);

    if (!requestId) {
        return res.status(400).json({ message: "Invalid request ID." });
    }

    try {
        const reviewed = await withTransaction(async (client) => {
            const result = await client.query(
                `UPDATE admin_requests
                 SET status = $1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $2
                 WHERE id = $3 AND status = 'pending'
                 RETURNING user_id`,
                [decision, req.session.adminEmail, requestId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            if (decision === "approved") {
                await client.query(
                    "UPDATE users SET is_admin = TRUE WHERE id = $1",
                    [result.rows[0].user_id]
                );
            }

            return result.rows[0];
        });

        if (!reviewed) {
            return res.status(404).json({
                message: "Request not found or already reviewed."
            });
        }

        logEvent(
            decision === "approved" ? "success" : "info",
            decision === "approved"
                ? "Admin access approved"
                : "Admin access declined",
            `User ID ${reviewed.user_id}`,
            "Admin"
        );

        return res.status(200).json({
            message:
                decision === "approved"
                    ? "Admin access granted."
                    : "Request declined."
        });
    } catch (error) {
        console.error("Admin review error:", error.message);

        return res.status(500).json({ message: "Unable to update request." });
    }
}

app.post("/api/admin/requests/:id/approve", requireAdmin, (req, res) =>
    reviewAdminRequest(req, res, "approved")
);

app.post("/api/admin/requests/:id/decline", requireAdmin, (req, res) =>
    reviewAdminRequest(req, res, "declined")
);

app.get("/api/admin/infrastructure", requireAdmin, async (req, res) => {
    try {
        const samples = [];

        for (let i = 0; i < 3; i++) {
            const start = process.hrtime.bigint();
            await pool.query("SELECT 1");
            samples.push(Number(process.hrtime.bigint() - start) / 1e6);
        }

        const latencyMs = Math.round(
            samples.reduce((sum, value) => sum + value, 0) / samples.length
        );

        const dbResult = await pool.query(
            `SELECT
                current_database() AS name,
                version() AS version,
                pg_database_size(current_database()) AS size_bytes,
                (SELECT COUNT(*) FROM pg_stat_activity
                  WHERE datname = current_database())::int AS connections,
                current_setting('max_connections')::int AS max_connections`
        );

        let transactions = null;

        try {
            const stats = await pool.query(
                `SELECT xact_commit + xact_rollback AS total
                 FROM pg_stat_database
                 WHERE datname = current_database()`
            );
            transactions = Number(stats.rows[0]?.total ?? 0);
        } catch (statsError) {
            transactions = null;
        }

        const db = dbResult.rows[0];
        const memory = process.memoryUsage();

        return res.status(200).json({
            status: latencyMs < 500 ? "operational" : "degraded",
            checkedAt: new Date().toISOString(),
            database: {
                name: db.name,
                host: process.env.DB_HOST || "unknown",
                version: db.version.split(",")[0],
                sizeBytes: Number(db.size_bytes),
                connections: db.connections,
                maxConnections: db.max_connections,
                latencyMs,
                transactions
            },
            pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            },
            runtime: {
                node: process.version,
                platform: process.platform,
                environment: process.env.NODE_ENV || "development",
                uptimeSeconds: Math.round(process.uptime()),
                memoryMb: Math.round(memory.rss / 1024 / 1024),
                heapMb: Math.round(memory.heapUsed / 1024 / 1024)
            },
            events: events.slice(0, 8)
        });
    } catch (error) {
        console.error("Infrastructure error:", error.message);

        return res.status(500).json({
            message: "Unable to read infrastructure metrics."
        });
    }
});

app.get("/api/admin/events", requireAdmin, (req, res) => {
    return res.status(200).json({ events });
});

logEvent("success", "Server started", `Node ${process.version}`, "Runtime");
const schemaReady = ensureSchema();

if (require.main === module) {
    schemaReady.then(() => {
        app.listen(PORT, () => {
            console.log(`Server started on port ${PORT}`);
        });
    });
}

module.exports = app;
