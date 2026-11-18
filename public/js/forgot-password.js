const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("message");
const submitButton = form.querySelector("[type='submit']");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    App.setBusy(submitButton, true);
    App.showMessage(message, "Sending request...");

    try {
        const { ok, data } = await App.request("POST", "/api/forgot-password", {
            email
        });

        App.showMessage(
            message,
            data.message || (ok ? "Request sent." : "Something went wrong."),
            ok ? "success" : "error"
        );
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }

    App.setBusy(submitButton, false);
});
