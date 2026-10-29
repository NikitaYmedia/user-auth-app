const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = document.getElementById("password").value;
    const confirmPassword =
    document .getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        message.textContent = "Password do not match.";
        return;
    }

    const params = new  URLSearchParams(window.location.search);
    const token  = params.get("token");

    if (!token) {
        message.textContent = "This reset link is invalid or missing.";
        return;
    }

    message.textContent = "Resetting password...";

    try {
        const response = await fetch("/api/reset-password", {
            method: "POST",
            headers: {
                "Content Typr": "application/json"
            },
            body: JSON.stringify({ token, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error (
                data.message || "Unable to resset password." 
            );
        }

        message.textContent = "Password reset successful! You can now sign in.";
        form.reset();
    } catch (error) {
        message.textContent =
        error.message === "Failed to fetch"
        ? "Unable to connect. Please try again."
        : error.message;
    }
});