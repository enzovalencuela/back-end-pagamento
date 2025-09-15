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
    // Tabela 'users' agora inclui name, email e password
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00
      );
    `);
    console.log("Tabela 'users' verificada ou criada com sucesso!");
    client.release();
  } catch (err) {
    console.error("Erro ao criar a tabela:", err);
  }
};

// Nova função: Inserir um novo usuário
export const createUser = async (name, email, password) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, password]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
};

export const updateUserPassword = async (userId, newPassword) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "UPDATE users SET password = $1 WHERE id = $2 RETURNING id, email",
      [newPassword, userId]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
};

// Nova função: Buscar um usuário pelo email
export const findUserByEmail = async (email) => {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return res.rows[0];
  } finally {
    client.release();
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

// --- Funções de Carrinho ---

// Função para adicionar um produto ao carrinho de um usuário
export const addToCart = async (userId, productId) => {
  try {
    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, productId]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Erro ao adicionar produto ao carrinho:", error.message);
    throw error;
  }
};

// Função para remover um produto do carrinho de um usuário
export const removeFromCart = async (userId, productId) => {
  try {
    const result = await pool.query(
      `DELETE FROM cart_items
       WHERE user_id = $1 AND product_id = $2
       RETURNING *`,
      [userId, productId]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Erro ao remover produto do carrinho:", error.message);
    throw error;
  }
};

// Função para obter todos os itens do carrinho de um usuário
export const getCartByUserId = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT product_id FROM cart_items WHERE user_id = $1`,
      [userId]
    );
    // Retorna apenas os IDs dos produtos
    return result.rows.map((row) => row.product_id);
  } catch (error) {
    console.error("Erro ao buscar carrinho:", error.message);
    throw error;
  }
};

// --- Funções de Produtos ---

// Função para obter todos os produtos
export const getAllProducts = async () => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    return result.rows;
  } catch (error) {
    console.error("Erro ao buscar todos os produtos:", error.message);
    throw error;
  }
};

// Função para obter um produto por ID
export const getProductById = async (productId) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    return result.rows[0];
  } catch (error) {
    console.error("Erro ao buscar produto por ID:", error.message);
    throw error;
  }
};

export default pool;
