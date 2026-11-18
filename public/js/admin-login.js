const form = document.getElementById("adminLoginForm");
const message = document.getElementById("message");
const submitButton = form.querySelector("[type='submit']");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember").checked;

    App.setBusy(submitButton, true);
    App.showMessage(message, "Signing in...");

    try {
        const { ok, data } = await App.request("POST", "/admin-login", {
            email,
            password,
            remember
        });

        if (!ok) {
            App.showMessage(message, data.message || "Login failed.", "error");
            App.setBusy(submitButton, false);
            return;
        }

        window.location.href = "/admin.html";
    } catch (error) {
        App.showMessage(message, error.message, "error");
        App.setBusy(submitButton, false);
    }
});
