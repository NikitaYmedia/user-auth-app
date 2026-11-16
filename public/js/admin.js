
const totalUsers = document.getElementById("totalUsers");
const usersTable = document.getElementById("usersTable");
const message = document.getElementById("message");
const search = document.getElementById("search");
const logoutButton = document.getElementById("logoutButton");

const profilePanel = document.getElementById("profilePanel");
const profileId = document.getElementById("profileId");
const profileEmail = document.getElementById("profileEmail");
const profileDate = document.getElementById("profileDate");
const profilePassword = document.getElementById("profilePassword");
const profileMessage = document.getElementById("profileMessage");
const closeProfile = document.getElementById("closeProfile");

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

        const actionsCell = document.createElement("td");

        // Profile button
        const profileButton = document.createElement("button");
        profileButton.textContent = "Profile";
        profileButton.className = "action-button profile-button";

        profileButton.addEventListener("click", () => {
            openProfile(user.id);
        });

        // Delete button
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "action-button delete-button";

        deleteButton.addEventListener("click", () => {
            deleteUser(user.id, user.email);
        });

        actionsCell.appendChild(profileButton);
        actionsCell.appendChild(deleteButton);

        row.appendChild(idCell);
        row.appendChild(emailCell);
        row.appendChild(actionsCell);

        usersTable.appendChild(row);
    });
}

async function openProfile(userId) {
    profilePanel.style.display = "block";
    profileMessage.textContent = "Loading profile...";

    profileId.textContent = "";
    profileEmail.textContent = "";
    profileDate.textContent = "";
    profilePassword.textContent = "";

    try {
        const response = await fetch(`/api/admin/users/${userId}`);

        if (response.status === 401 || response.status === 403) {
            window.location.href = "/admin-login.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load profile.");
        }

        const user = data.user;

        profileId.textContent = user.id;
        profileEmail.textContent = user.email;

        profileDate.textContent = user.created_at
            ? new Date(user.created_at).toLocaleString()
            : "Unknown";

        profilePassword.textContent = user.password_set
            ? "Password is set"
            : "Password is not set";

        profileMessage.textContent = "";

    } catch (error) {
        profileMessage.textContent = error.message;
    }
}

async function deleteUser(userId, email) {
    const confirmed = confirm(
        `Are you sure you want to delete this user?\n\n${email}\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: "DELETE"
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = "/admin-login.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to delete user.");
        }

        if (profileId.textContent === String(userId)) {
            profilePanel.style.display = "none";
        }

        message.textContent = "User deleted successfully.";

        await loadUsers();

    } catch (error) {
        message.textContent = error.message;
    }
}

search.addEventListener("input", renderUsers);

closeProfile.addEventListener("click", () => {
    profilePanel.style.display = "none";
});

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
