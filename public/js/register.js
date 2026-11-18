const form = document.getElementById("registerForm");
const message = document.getElementById("message");
const submitButton = form.querySelector("[type='submit']");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    App.setBusy(submitButton, true);
    App.showMessage(message, "");

    try {
        const { ok, data } = await App.request("POST", "/register", {
            email,
            password
        });

        if (!ok) {
            App.showMessage(message, data.message || "Registration failed.", "error");
            App.setBusy(submitButton, false);
            return;
        }

        App.showMessage(
            message,
            "Registration successful! Redirecting to login...",
            "success"
        );

        setTimeout(() => {
            window.location.href = "/login.html";
        }, 1200);
    } catch (error) {
        App.showMessage(message, error.message, "error");
        App.setBusy(submitButton, false);
    }
});
