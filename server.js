const pool = require("./db");
const express = require("express");
const bcrypt = require("bcrypt")
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60
    }
}));

app.use(express.static("public"));
app.get("/", (req, res) => {
    res.send("Server is work!");
});

app.post("/register", async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    email = email.trim().toLowerCase();

    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters long."
        });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({
            message: "Password must not exceed 72 bytes."
        });
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
            "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
            [email, passwordHash]
        );

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
    let { email, password } = req.body;

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
        return res.status(400).json({
            message: "Invalid email or password."
        });
    }

    try {
        const result = await pool.query(
            "SELECT id, email, password_hash FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Session error:", error.message);

                return res.status(500).json({
                    message: "Login failed. Please try again."
                });
            }

            req.session.userId = user.id;
            req.session.userEmail = user.email;

            req.session.save((error) => {
                if (error) {
                    console.error("Session save error:", error.message);

                    return res.status(500).json({
                        message: "Login failed. Please try again."
                    });
                }

                return res.status(200).json({
                    message: "Login successful!"
                });
            });
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
});

app.get("/account", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please log in."
        });
    }

    return res.status(200).json({
        id: req.session.userId,
        email: req.session.userEmail
    });
});

app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error.message);

            return res.status(500).json({
                message: "Could not log out."
            });
        }

        res.clearCookie("connect.sid");

        return res.status(200).json({
            message: "Logged out successfully."
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server strat: http://localhost:${PORT}`);
});