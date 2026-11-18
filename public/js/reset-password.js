const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("message");
const submitButton = form.querySelector("[type='submit']");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        App.showMessage(message, "Passwords do not match.", "error");
        return;
    }

    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
        App.showMessage(message, "This reset link is invalid or missing.", "error");
        return;
    }

    App.setBusy(submitButton, true);
    App.showMessage(message, "Resetting password...");

    try {
        const { ok, data } = await App.request("POST", "/api/reset-password", {
            token,
            password
        });

        if (!ok) {
            App.showMessage(message, data.message || "Unable to reset password.", "error");
            App.setBusy(submitButton, false);
            return;
        }

        App.showMessage(
            message,
            "Password reset successful! You can now sign in.",
            "success"
        );
        form.reset();
    } catch (error) {
        App.showMessage(message, error.message, "error");
        App.setBusy(submitButton, false);
    }
});
