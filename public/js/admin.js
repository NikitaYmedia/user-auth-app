
const totalUsers = document.getElementById("totalUsers");
const usersTable = document.getElementById("usersTable");
const message = document.getElementById("message");
const search = document.getElementById("search");
const logoutButton = document.getElementById("logoutButton");

let users = [];

async function loadUsers() {
    message.textContent = "Loading users...";

    try {
        const response = await fetch("/api/admin/users");

        if (response.status === 401 || response.status === 403) {
            window.location.href = "/admin-login.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load users.");
        }

        users = data.users || [];

        totalUsers.textContent = data.total ?? users.length;

        renderUsers();

        message.textContent = users.length
            ? `Showing ${users.length} registered users.`
            : "No registered users yet.";

    } catch (error) {
        message.textContent = error.message;
    }
}

function renderUsers() {
    const query = search.value.trim().toLowerCase();

    const filteredUsers = users.filter(user =>
        String(user.email || "").toLowerCase().includes(query)
    );

    usersTable.innerHTML = "";

    filteredUsers.forEach(user => {
        const row = document.createElement("tr");

        const idCell = document.createElement("td");
        idCell.textContent = user.id;

        const emailCell = document.createElement("td");
        emailCell.textContent = user.email;

        row.appendChild(idCell);
        row.appendChild(emailCell);

        usersTable.appendChild(row);
    });
}

search.addEventListener("input", renderUsers);

logoutButton.addEventListener("click", async () => {
    try {
        const response = await fetch("/admin-logout", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Logout failed.");
        }

        window.location.href = "/admin-login.html";
    } catch (error) {
        message.textContent = error.message;
    }
});

loadUsers();
