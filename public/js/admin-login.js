
const form = document.getElementById("adminLoginForm");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    message.textContent = "Signing in...";

    try {
        const response = await fetch("/admin-login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Login failed.");
        }

        window.location.href = "/admin.html";
    } catch (error) {
        message.textContent =
            error.message === "Failed to fetch"
                ? "Unable to connect. Please try again."
                : error.message;
    }
});
