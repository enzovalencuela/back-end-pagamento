// src/server/database.js

import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

export const createTable = async () => {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00
      );
    `);
    console.log("Tabela 'users' verificada ou criada com sucesso!");
    client.release();
  } catch (err) {
    console.error("Erro ao criar a tabela:", err);
  }
};

export const getBalance = async (userId) => {
  const client = await pool.connect();
  const res = await client.query("SELECT balance FROM users WHERE id = $1", [
    userId,
  ]);
  client.release();
  return res.rows[0] ? res.rows[0].balance : 0;
};

export const addBalance = async (userId, amount) => {
  const client = await pool.connect();
  const res = await client.query(
    "UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance",
    [amount, userId]
  );
  client.release();
  return res.rows[0] ? res.rows[0].balance : null;
};

export default pool;
