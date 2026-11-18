const pageMessage = document.getElementById("pageMessage");

const tierBadge = document.getElementById("tierBadge");
const tierText = document.getElementById("tierText");
const requestAdminButton = document.getElementById("requestAdminButton");
const openAdminLink = document.getElementById("openAdminLink");
const emailValue = document.getElementById("emailValue");
const passwordUpdated = document.getElementById("passwordUpdated");

let account = null;

/* ---------- Render ---------- */

function setBadge(text, kind) {
    tierBadge.textContent = text;
    tierBadge.className = "badge badge--dot" + (kind ? ` badge--${kind}` : "");
}

function renderAccount() {
    emailValue.textContent = account.email;
    passwordUpdated.textContent =
        "Updated " + App.timeAgo(account.passwordUpdatedAt);

    requestAdminButton.hidden = true;
    requestAdminButton.disabled = false;
    openAdminLink.hidden = true;

    if (account.isAdmin) {
        setBadge("Administrator", "success");
        tierText.textContent =
            "Your account has administrator privileges. You can manage users and review infrastructure from the admin console.";
        openAdminLink.hidden = false;
        return;
    }

    const status = account.adminRequest?.status;

    if (status === "pending") {
        setBadge("Standard User • Request pending", "warning");
        tierText.textContent =
            "Your admin access request is waiting for review. You will be able to sign in to the admin console once it is approved.";
        requestAdminButton.hidden = false;
        requestAdminButton.disabled = true;
        return;
    }

    setBadge(
        status === "declined"
            ? "Standard User • Request declined"
            : "Standard User • Not admin"
    );
    tierText.textContent =
        "Your account currently has standard member privileges. Configuration updates require root admin elevation.";
    requestAdminButton.hidden = false;
}

async function loadAccount() {
    try {
        const { ok, data } = await App.request("GET", "/account");

        if (!ok) {
            window.location.href = "/login.html";
            return;
        }

        account = data;
        renderAccount();
    } catch (error) {
        App.showMessage(pageMessage, error.message, "error");
    }
}

/* ---------- Dialog helper ---------- */

function setupDialog({ dialogId, formId, messageId, onSubmit, onOpen }) {
    const dialog = document.getElementById(dialogId);
    const form = document.getElementById(formId);
    const message = document.getElementById(messageId);
    const submit = form.querySelector("[type='submit']");

    dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
    });

    dialog.addEventListener("close", () => {
        form.reset();
        App.showMessage(message, "");
        form
            .querySelectorAll("[data-toggle-password].is-visible")
            .forEach((toggle) => toggle.click());
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        App.setBusy(submit, true);
        App.showMessage(message, "");

        try {
            await onSubmit({ dialog, message });
        } catch (error) {
            App.showMessage(message, error.message, "error");
        }

        App.setBusy(submit, false);
    });

    return {
        open() {
            if (onOpen) {
                onOpen();
            }
            dialog.showModal();
        }
    };
}

/* ---------- Admin request ---------- */

const adminRequestDialog = setupDialog({
    dialogId: "adminRequestDialog",
    formId: "adminRequestForm",
    messageId: "adminRequestMessage",
    async onSubmit({ dialog, message }) {
        const reason = document.getElementById("adminReason").value.trim();
        const { ok, data } = await App.request(
            "POST",
            "/api/account/admin-request",
            { reason }
        );

        if (!ok) {
            App.showMessage(message, data.message || "Request failed.", "error");
            return;
        }

        dialog.close();
        App.showToast(data.message);
        await loadAccount();
    }
});

requestAdminButton.addEventListener("click", () => adminRequestDialog.open());

/* ---------- Email ---------- */

const emailDialog = setupDialog({
    dialogId: "emailDialog",
    formId: "emailForm",
    messageId: "emailMessage",
    onOpen() {
        document.getElementById("newEmail").value = account.email;
    },
    async onSubmit({ dialog, message }) {
        const { ok, data } = await App.request("PATCH", "/api/account/email", {
            email: document.getElementById("newEmail").value,
            password: document.getElementById("emailPassword").value
        });

        if (!ok) {
            App.showMessage(message, data.message || "Update failed.", "error");
            return;
        }

        dialog.close();
        App.showToast("Email updated.");
        await loadAccount();
    }
});

document
    .getElementById("editEmailButton")
    .addEventListener("click", () => emailDialog.open());

document.getElementById("copyEmailButton").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(account.email);
        App.showToast("Email copied.");
    } catch (error) {
        App.showToast("Could not copy the email.", "error");
    }
});

/* ---------- Password ---------- */

const passwordDialog = setupDialog({
    dialogId: "passwordDialog",
    formId: "passwordForm",
    messageId: "passwordMessage",
    async onSubmit({ dialog, message }) {
        const { ok, data } = await App.request("POST", "/api/account/password", {
            currentPassword: document.getElementById("currentPassword").value,
            newPassword: document.getElementById("newPassword").value
        });

        if (!ok) {
            App.showMessage(message, data.message || "Update failed.", "error");
            return;
        }

        dialog.close();
        App.showToast("Password updated.");
        await loadAccount();
    }
});

document
    .getElementById("changePasswordButton")
    .addEventListener("click", () => passwordDialog.open());

/* ---------- Delete account ---------- */

const deleteDialog = setupDialog({
    dialogId: "deleteDialog",
    formId: "deleteForm",
    messageId: "deleteMessage",
    async onSubmit({ message }) {
        const { ok, data } = await App.request("DELETE", "/api/account", {
            password: document.getElementById("deletePassword").value
        });

        if (!ok) {
            App.showMessage(message, data.message || "Deletion failed.", "error");
            return;
        }

        window.location.href = "/register.html";
    }
});

document
    .getElementById("deleteAccountButton")
    .addEventListener("click", () => deleteDialog.open());

/* ---------- Logout ---------- */

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        const { ok } = await App.request("POST", "/logout");

        if (!ok) {
            App.showMessage(pageMessage, "Could not log out. Try again.", "error");
            return;
        }

        window.location.href = "/login.html";
    } catch (error) {
        App.showMessage(pageMessage, error.message, "error");
    }
});

loadAccount();
