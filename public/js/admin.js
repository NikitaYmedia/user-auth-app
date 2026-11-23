const $ = (id) => document.getElementById(id);

const message = $("message");
const usersTable = $("usersTable");
const search = $("search");

const views = {
    users: { title: "Admin Dashboard", crumb: "Dashboard" },
    requests: { title: "Admin Requests", crumb: "Admin Requests" },
    infrastructure: { title: "Infrastructure", crumb: "Infrastructure" },
    logs: { title: "Security Logs", crumb: "Security Logs" },
    config: { title: "System Config", crumb: "System Config" }
};

let users = [];
let requests = [];
let selectedUserId = null;
let currentView = "users";

function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    return node;
}

function icon(name) {
    return el("span", `icon icon-${name}`);
}

function initial(email) {
    return String(email || "?").charAt(0).toUpperCase();
}

async function adminRequest(method, url, body) {
    const result = await App.request(method, url, body);

    if (result.status === 401 || result.status === 403) {
        window.location.href = "/admin-login.html";
        throw new Error("Redirecting to login...");
    }

    if (!result.ok) {
        throw new Error(result.data.message || "Request failed.");
    }

    return result.data;
}

function formatBytes(bytes) {
    if (bytes >= 1024 ** 3) {
        return (bytes / 1024 ** 3).toFixed(2) + " GB";
    }

    return (bytes / 1024 ** 2).toFixed(1) + " MB";
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}


function showView(name) {
    if (!views[name]) {
        name = "users";
    }

    currentView = name;

    Object.keys(views).forEach((key) => {
        $("view-" + key).hidden = key !== name;
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.view === name);
    });

    $("topbarTitle").textContent = views[name].title;
    $("crumbView").textContent = views[name].crumb;
    App.showMessage(message, "");

    history.replaceState(null, "", "#" + name);

    if (name === "users") {
        loadUsers();
        loadRequests();
    }

    if (name === "requests") {
        loadRequests();
    }

    if (name === "infrastructure") {
        loadInfrastructure();
    }

    if (name === "logs") {
        loadLogs();
    }
}

document.querySelectorAll("[data-view]").forEach((control) => {
    control.addEventListener("click", () => showView(control.dataset.view));
});

async function loadMe() {
    try {
        const me = await adminRequest("GET", "/api/admin/me");

        $("meEmail").textContent = me.email;
        $("meName").textContent = me.root ? "Root Admin" : "Administrator";
        $("meAvatar").textContent = initial(me.email) + (me.root ? "D" : "");
        $("envBadge").textContent =
            me.environment.charAt(0).toUpperCase() + me.environment.slice(1);
        $("envRegion").textContent = me.region;

        renderPendingCount(me.pendingRequests);
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

function renderPendingCount(count) {
    const badge = $("navRequestsBadge");

    badge.hidden = count === 0;
    badge.textContent = `${count} pending`;
    $("pendingBadge").textContent = `${count} Pending`;
}

async function loadUsers() {
    $("usersSummary").textContent = "Loading users...";

    try {
        const data = await adminRequest("GET", "/api/admin/users");

        users = data.users || [];

        $("totalUsers").textContent = data.total ?? users.length;
        $("navUsersCount").textContent = data.total ?? users.length;
        $("verifiedPercent").textContent = `${data.verifiedPercent}%`;

        renderUsers();
    } catch (error) {
        $("usersSummary").textContent = "Unable to load users.";
        App.showMessage(message, error.message, "error");
    }
}

function renderUsers() {
    const query = search.value.trim().toLowerCase();

    const filtered = users.filter((user) =>
        String(user.email || "").toLowerCase().includes(query)
    );

    usersTable.replaceChildren();

    if (filtered.length === 0) {
        const row = el("tr");
        const cell = el(
            "td",
            "table__empty",
            users.length ? "No users match your search." : "No registered users yet."
        );
        cell.colSpan = 4;
        row.appendChild(cell);
        usersTable.appendChild(row);
    }

    filtered.forEach((user) => {
        const selected = user.id === selectedUserId;
        const row = el("tr", "table__row" + (selected ? " is-selected" : ""));

        row.appendChild(el("td", "", user.id));

        const emailCell = el("td");
        const userCell = el("div", "user-cell");
        userCell.appendChild(el("span", "avatar", initial(user.email)));
        userCell.appendChild(el("span", "", user.email));

        if (selected) {
            userCell.appendChild(el("span", "badge badge--dark", "Selected"));
        }

        if (user.isAdmin) {
            userCell.appendChild(el("span", "badge badge--info", "Admin"));
        }

        emailCell.appendChild(userCell);
        row.appendChild(emailCell);

        const statusCell = el("td");
        statusCell.appendChild(el("span", "badge badge--success", "Active"));
        row.appendChild(statusCell);

        const actionsCell = el("td");
        const actions = el("div", "table__actions");

        const profileButton = el(
            "button",
            "btn btn--sm " + (selected ? "btn--dark" : "btn--outline"),
            "Profile"
        );
        profileButton.type = "button";
        profileButton.addEventListener("click", () => openProfile(user.id));

        const deleteButton = el("button", "btn btn--sm btn--danger-soft", "Delete");
        deleteButton.type = "button";
        deleteButton.addEventListener("click", () =>
            deleteUser(user.id, user.email)
        );

        actions.append(profileButton, deleteButton);
        actionsCell.appendChild(actions);
        row.appendChild(actionsCell);

        usersTable.appendChild(row);
    });

    $("usersSummary").textContent = `Showing ${users.length} registered user${users.length === 1 ? "" : "s"}.`;
    $("usersFooter").textContent = filtered.length
        ? `Displaying ${filtered.length === users.length ? "all " : ""}${filtered.length} recorded entr${filtered.length === 1 ? "y" : "ies"}`
        : "No entries";
}

function closeProfilePanel() {
    selectedUserId = null;
    $("profileBody").hidden = true;
    $("profileEmpty").hidden = false;
    renderUsers();
}

async function openProfile(userId) {
    selectedUserId = userId;

    $("profileEmpty").hidden = true;
    $("profileBody").hidden = false;
    App.showMessage($("profileMessage"), "Loading profile...");

    renderUsers();

    try {
        const data = await adminRequest("GET", `/api/admin/users/${userId}`);
        const user = data.user;

        $("profileId").textContent = `ID: ${user.id}`;
        $("profileEmail").textContent = user.email;
        $("profileDate").textContent = App.formatDate(user.created_at);
        $("profilePassword").textContent = user.password_set
            ? "Password is set"
            : "Password is not set";

        App.showMessage($("profileMessage"), "");
    } catch (error) {
        App.showMessage($("profileMessage"), error.message, "error");
    }
}

$("closeProfile").addEventListener("click", closeProfilePanel);

$("resetPasswordButton").addEventListener("click", async () => {
    if (!selectedUserId) {
        return;
    }

    const button = $("resetPasswordButton");
    App.setBusy(button, true);

    try {
        const data = await adminRequest(
            "POST",
            `/api/admin/users/${selectedUserId}/reset-password`
        );

        App.showToast(data.message);
    } catch (error) {
        App.showToast(error.message, "error");
    }

    App.setBusy(button, false);
});

async function deleteUser(userId, email) {
    const confirmed = confirm(
        `Are you sure you want to delete this user?\n\n${email}\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    try {
        await adminRequest("DELETE", `/api/admin/users/${userId}`);

        if (selectedUserId === userId) {
            closeProfilePanel();
        }

        App.showToast("User deleted successfully.");

        await Promise.all([loadUsers(), loadRequests(), loadMe()]);
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

search.addEventListener("input", renderUsers);

function renderRequestItem(request) {
    const item = el("article", "request");

    item.appendChild(el("span", "avatar avatar--amber", initial(request.email)));

    const body = el("div", "request__body");
    const who = el("p", "request__who");
    who.appendChild(el("span", "", request.email));
    who.appendChild(el("span", "chip", `User ID: ${request.userId}`));

    if (request.status !== "pending") {
        who.appendChild(
            el(
                "span",
                "badge " +
                (request.status === "approved" ? "badge--success" : "badge--danger"),
                request.status === "approved" ? "Approved" : "Declined"
            )
        );
    }

    body.appendChild(who);
    body.appendChild(el("p", "request__reason", `“${request.reason}”`));

    const meta = el("p", "request__meta");
    meta.appendChild(icon("clock"));
    meta.appendChild(
        el(
            "span",
            "",
            request.status === "pending"
                ? `Requested ${App.timeAgo(request.createdAt)}`
                : `Reviewed ${App.timeAgo(request.reviewedAt)} by ${request.reviewedBy || "admin"}`
        )
    );
    body.appendChild(meta);
    item.appendChild(body);

    if (request.status === "pending") {
        const actions = el("div", "request__actions");

        const decline = el("button", "btn btn--outline btn--sm", "Decline");
        decline.type = "button";
        decline.addEventListener("click", () => reviewRequest(request.id, "decline"));

        const approve = el("button", "btn btn--dark btn--sm", "Approve Admin");
        approve.type = "button";
        approve.addEventListener("click", () => reviewRequest(request.id, "approve"));

        actions.append(decline, approve);
        item.appendChild(actions);
    }

    return item;
}

function renderRequestList(container, list, emptyText) {
    container.replaceChildren();

    if (list.length === 0) {
        container.appendChild(el("p", "requests__empty", emptyText));
        return;
    }

    list.forEach((request) => container.appendChild(renderRequestItem(request)));
}

async function loadRequests() {
    try {
        const data = await adminRequest("GET", "/api/admin/requests");

        requests = data.requests || [];

        const pending = requests.filter((request) => request.status === "pending");

        renderPendingCount(pending.length);
        renderRequestList($("pendingList"), pending, "No pending requests.");
        renderRequestList($("allRequests"), requests, "No requests yet.");
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

async function reviewRequest(requestId, action) {
    try {
        const data = await adminRequest(
            "POST",
            `/api/admin/requests/${requestId}/${action}`
        );

        App.showToast(data.message);

        await Promise.all([loadRequests(), loadUsers()]);
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

function fillKv(container, rows) {
    container.replaceChildren();

    rows.forEach(([label, value]) => {
        const row = el("div", "kv__row");
        row.appendChild(el("dt", "", label));
        row.appendChild(el("dd", "", value));
        container.appendChild(row);
    });
}

function renderEvents(container, list) {
    container.replaceChildren();

    if (list.length === 0) {
        container.appendChild(el("li", "events__empty", "No events recorded yet."));
        return;
    }

    const icons = { success: "circle-check", warning: "alert", info: "info" };

    list.forEach((event) => {
        const item = el("li", "event");

        const badge = el("span", `event__icon event__icon--${event.type}`);
        badge.appendChild(icon(icons[event.type] || "info"));
        item.appendChild(badge);

        const body = el("div", "event__body");
        body.appendChild(el("p", "event__title", event.title));

        if (event.detail) {
            body.appendChild(el("p", "event__detail", event.detail));
        }

        item.appendChild(body);

        const side = el("div", "event__side", App.timeAgo(event.time));
        side.appendChild(el("span", "event__source", event.source));
        item.appendChild(side);

        container.appendChild(item);
    });
}

async function loadInfrastructure() {
    const button = $("refreshInfra");
    App.setBusy(button, true);

    try {
        const data = await adminRequest("GET", "/api/admin/infrastructure");
        const { database, pool, runtime } = data;
        const operational = data.status === "operational";

        $("infraStatus").textContent =
            "System Status: " + (operational ? "100% Operational" : "Degraded");
        $("infraStatus").className =
            "badge " + (operational ? "badge--success" : "badge--warning");

        $("mHealth").textContent = operational
            ? "All Systems Operational"
            : "Degraded";
        $("mHealthNote").textContent = `Uptime ${formatUptime(runtime.uptimeSeconds)}`;
        $("mLatency").textContent = `${database.latencyMs}ms`;
        $("mTransactions").textContent =
            database.transactions === null
                ? "n/a"
                : database.transactions.toLocaleString("en-US");
        $("mConnections").textContent =
            `${database.connections} / ${database.maxConnections}`;
        $("mConnectionsNote").textContent = `Pool waiting queue: ${pool.waiting}`;

        fillKv($("dbKv"), [
            ["Database", database.name],
            ["Version", database.version],
            ["Storage", formatBytes(database.sizeBytes)],
            ["Host", database.host],
            ["Direct latency", `${database.latencyMs}ms`]
        ]);

        fillKv($("poolKv"), [
            ["Total clients", pool.total],
            ["Idle clients", pool.idle],
            ["Waiting requests", pool.waiting],
            ["Active connections", `${database.connections} / ${database.maxConnections}`]
        ]);

        fillKv($("runtimeKv"), [
            ["Node.js", runtime.node],
            ["Environment", runtime.environment],
            ["Platform", runtime.platform],
            ["Uptime", formatUptime(runtime.uptimeSeconds)],
            ["Memory (RSS)", `${runtime.memoryMb} MB`],
            ["Heap used", `${runtime.heapMb} MB`]
        ]);

        renderEvents($("infraEvents"), data.events);
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }

    App.setBusy(button, false);
}

$("refreshInfra").addEventListener("click", loadInfrastructure);

async function loadLogs() {
    try {
        const data = await adminRequest("GET", "/api/admin/events");
        renderEvents($("logEvents"), data.events);
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

async function logout() {
    try {
        const { ok } = await App.request("POST", "/admin-logout");

        if (!ok) {
            throw new Error("Logout failed.");
        }

        window.location.href = "/admin-login.html";
    } catch (error) {
        App.showMessage(message, error.message, "error");
    }
}

$("logoutButton").addEventListener("click", logout);
$("sidebarLogout").addEventListener("click", logout);

const consoleForm = $("consoleForm");
const consoleInput = $("consoleInput");
const consoleOutput = $("consoleOutput");
const clearConsoleButton = $("clearConsole");

function addConsoleLine(text, className = "") {
    const line = el(
        "p",
        "console-line" + (className ? " " + className : ""),
        text
    );

    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearConsole() {
    consoleOutput.replaceChild();
}

function executeCommand(input) {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
        case "help":
            addConsoleLine("Available commands:", "console-line--muted");
            addConsoleLine("");
            addConsoleLine("  help     Show available commands");
            addConsoleLine("  clear    Clear console");
            addConsoleLine("  date     Show current date and time");
            break;

            case "clear":
                clearConsole();
                addConsoleLine("Console cleared.", "console-line--muted");
                break;

                case "data":
                    addConsoleLine(new Data().toString());
                    break;

                    default:
                        addConsoleLine(
                            `Command not found: ${command}`,
                            "console-line--warning"
                        );
    }
}

if (consoleForm && consileInput && consoleOutput) {
    consoleForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const command = consoleInput.value.trim();

        if (!command) return ;
        addConsoleLine(`admin@obsidian:~$ ${command}`, "console-prompt");

        executeCommand(command);

        consoleInput.value = "";
        consoleInput.focus();
    });

    if (clearConsoleButton) {
        clearConsoleButton.addEventListener("click", () => {
            clearConsole();
            addConsoleLine("Console cleared.", "console-line--muted");
            consoleInput.focus();
        });
    }
}

loadMe();
showView(location.hash.slice(1));