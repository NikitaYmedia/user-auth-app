const form = document.getElementById("loginForm");
const message = document.getElementById("message");
const submitButton = form.querySelector("[type='submit']");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    App.setBusy(submitButton, true);
    App.showMessage(message, "");

    try {
        const { ok, data } = await App.request("POST", "/login", {
            email,
            password
        });

        if (!ok) {
            App.showMessage(message, data.message || "Login failed.", "error");
            App.setBusy(submitButton, false);
            return;
        }

        App.showMessage(message, "Login successful! Redirecting...", "success");
        window.location.href = "/account.html";
    } catch (error) {
        App.showMessage(message, error.message, "error");
        App.setBusy(submitButton, false);
    }
});
