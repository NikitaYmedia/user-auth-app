const pool = require("./db");

async function createUsersTable() {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

        console.log("The user table has been created!");
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        if (typeof pool.end === "function") {
            await pool.end();
        }
    }
}

createUsersTable();