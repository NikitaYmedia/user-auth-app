const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("message")

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    message.textContent = "Sending request...";
    message.style.color = "";

    try {
        const response = await fetch("/api/forgot-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Something went wrong.");
        }

        message.textContent = data.message;
    } catch (error) {
        message.textContent =
           error.message === "Failed to fetch"
           ? "Unable to connect. Please try again."
           :error.message;
    }
});