require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Для локального Postgres без SSL: DB_SSL=false в .env
    ssl:
        process.env.DB_SSL === "false"
            ? false
            : { rejectUnauthorized: true }
});

module.exports = pool;