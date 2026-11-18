// Общие помощники для всех страниц. Здесь нет стилей: только классы и атрибуты.
(function () {
    async function request(method, url, body) {
        let response;

        try {
            response = await fetch(url, {
                method,
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (error) {
            throw new Error("Could not connect to server.");
        }

        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        return { ok: response.ok, status: response.status, data };
    }

    // kind: "error" | "success" | "" (нейтральное сообщение). Пустой текст прячет блок.
    function showMessage(element, text, kind) {
        if (!element) {
            return;
        }

        element.textContent = text || "";
        element.hidden = !text;
        element.classList.toggle("is-error", kind === "error");
        element.classList.toggle("is-success", kind === "success");
    }

    function showToast(text, kind) {
        const toast = document.createElement("div");
        toast.className = "toast" + (kind === "error" ? " is-error" : "");
        toast.setAttribute("role", "status");
        toast.textContent = text;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3500);
    }

    function setBusy(button, busy) {
        if (button) {
            button.disabled = busy;
        }
    }

    function initPasswordToggles() {
        document.querySelectorAll("[data-toggle-password]").forEach((button) => {
            const input = button
                .closest(".field__control")
                .querySelector("input");

            button.addEventListener("click", () => {
                const visible = input.type === "password";

                input.type = visible ? "text" : "password";
                button.classList.toggle("is-visible", visible);
                button.setAttribute(
                    "aria-label",
                    visible ? "Hide password" : "Show password"
                );
            });
        });
    }

    function formatDate(value) {
        if (!value) {
            return "Unknown";
        }

        return new Date(value).toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function timeAgo(value) {
        const seconds = Math.max(
            0,
            Math.round((Date.now() - new Date(value).getTime()) / 1000)
        );

        const units = [
            ["day", 86400],
            ["hour", 3600],
            ["min", 60]
        ];

        for (const [name, size] of units) {
            if (seconds >= size) {
                const count = Math.floor(seconds / size);
                return `${count} ${name}${name !== "min" && count > 1 ? "s" : ""} ago`;
            }
        }

        return "just now";
    }

    document.addEventListener("DOMContentLoaded", initPasswordToggles);

    window.App = {
        request,
        showMessage,
        showToast,
        setBusy,
        formatDate,
        timeAgo
    };
})();
