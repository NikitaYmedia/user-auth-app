const emailElement = document.getElementById("email");
const logoutButton = document.getElementById("logoutButton");

async function loadAccount() {
    try {
        const response = await fetch("/account");

        if (!response.ok) {
            window.location.href = "/login.html";
            return;
        }

        const data = await response.json();
        emailElement.textContent = "Logged in as: " + data.email;

    } catch (error) {
        emailElement.textContent = "Could not connect to server.";
    }
}

logoutButton.addEventListener("click", async () => {
    try {
        const response = await fetch("/logout", {
            method: "POST"
        });

        if (response.ok) {
            window.location.href = "/login.html";
        } else {
            emailElement.textContent = "Could not log out. Try again.";
        }
    } catch (error) {
        emailElement.textContent = "Could not connect to server.";
    }
});

loadAccount();