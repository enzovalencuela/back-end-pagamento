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

export const createTables = async () => {
  try {
    const client = await pool.connect();

    // Tabela 'users' (com a nova coluna 'role')
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        role VARCHAR(50) NOT NULL DEFAULT 'user'
      );
    `);
    console.log("Tabela 'users' verificada ou criada com sucesso!");

    // Tabela 'products' (com as novas colunas)
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        preco DECIMAL(10, 2) NOT NULL,
        preco_original DECIMAL(10, 2),
        parcelamento VARCHAR(255),
        img VARCHAR(255) NOT NULL,
        descricao TEXT,
        categoria VARCHAR(255),
        tags VARCHAR(255)[],
        disponivel BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);
    console.log("Tabela 'products' verificada ou criada com sucesso!");

    // Tabela 'cart_items' (sem alterações)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE (user_id, product_id)
      );
    `);
    console.log("Tabela 'cart_items' verificada ou criada com sucesso!");

    // Tabela 'payments'
    await client.query(`
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
  status VARCHAR(50) NOT NULL, -- 'pending', 'approved', 'rejected' etc.
  provider VARCHAR(50), -- 'mercadopago', 'stripe'...
  provider_payment_id VARCHAR(255) UNIQUE, -- id no provedor
  installments INT, -- número de parcelas
  additional_info JSONB, -- dados adicionais estruturados
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

`);
    console.log("Tabela 'payments' verificada ou criada com sucesso!");

    // Tabela 'transactions' para gerenciar o histórico de balanço do usuário
    await client.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'credit' (adição) ou 'debit' (compra)
    provider VARCHAR(50) NOT NULL DEFAULT 'mercadopago',
    provider_payment_id VARCHAR(255) UNIQUE, -- Para evitar duplicidade de webhooks
    created_at TIMESTAMP DEFAULT NOW()
  );
`);
    console.log("Tabela 'transactions' verificada ou criada com sucesso!");

    // Adicionar depois da tabela 'transactions'

    // Tabela 'orders' para rastrear pedidos
    await client.query(`
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'shipped' etc.
    created_at TIMESTAMP DEFAULT NOW()
  );
`);
    console.log("Tabela 'orders' verificada ou criada com sucesso!");

    // Tabela 'order_items' para rastrear os produtos de cada pedido
    await client.query(`
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
  );
`);
    console.log("Tabela 'order_items' verificada ou criada com sucesso!");

    client.release();
  } catch (err) {
    console.error("Erro ao criar as tabelas:", err);
  }
};

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

export const getCartByUserId = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT product_id FROM cart_items WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row) => row.product_id);
  } catch (error) {
    console.error("Erro ao buscar carrinho:", error.message);
    throw error;
  }
};

// --- Funções de Produtos ---

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
export const addProducts = async (products) => {
  const client = await pool.connect();
  try {
    const promises = products.map((product) => {
      const tagsArray =
        typeof product.tags === "string"
          ? product.tags.split(",").map((tag) => tag.trim())
          : product.tags;
      const preco = parseFloat(product.preco);
      const preco_original = product.preco_original
        ? parseFloat(product.preco_original)
        : null;

      return client.query(
        "INSERT INTO products (titulo, preco, preco_original, parcelamento, img, descricao, categoria, tags, disponivel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
        [
          product.titulo,
          preco,
          preco_original,
          product.parcelamento,
          product.img,
          product.descricao,
          product.categoria,
          tagsArray,
          product.disponivel,
        ]
      );
    });
    const results = await Promise.all(promises);
    return results.map((res) => res.rows[0]);
  } finally {
    client.release();
  }
};

export async function createProduct(productData) {
  const {
    titulo,
    preco,
    preco_original,
    parcelamento,
    img,
    descricao,
    categoria,
    tags,
    disponivel,
  } = productData;
  const client = await pool.connect();
  try {
    const precoFloat = parseFloat(preco);
    const precoOriginalFloat = preco_original
      ? parseFloat(preco_original)
      : null;
    const tagsArray =
      typeof tags === "string"
        ? tags.split(",").map((tag) => tag.trim())
        : tags;

    const result = await client.query(
      `INSERT INTO products (titulo, preco, preco_original, parcelamento, img, descricao, categoria, tags, disponivel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        titulo,
        precoFloat,
        precoOriginalFloat,
        parcelamento,
        img,
        descricao,
        categoria,
        tagsArray,
        disponivel,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Atualizar um produto por ID
export async function updateProduct(id, productData) {
  const {
    titulo,
    preco,
    preco_original,
    parcelamento,
    img,
    descricao,
    categoria,
    tags,
    disponivel,
  } = productData;
  const client = await pool.connect();
  try {
    const precoFloat = parseFloat(preco);
    const precoOriginalFloat = preco_original
      ? parseFloat(preco_original)
      : null;
    const tagsArray =
      typeof tags === "string"
        ? tags.split(",").map((tag) => tag.trim())
        : tags;

    const result = await client.query(
      `UPDATE products SET titulo = $1, preco = $2, preco_original = $3, parcelamento = $4, img = $5, descricao = $6, categoria = $7, tags = $8, disponivel = $9 WHERE id = $10 RETURNING *`,
      [
        titulo,
        precoFloat,
        precoOriginalFloat,
        parcelamento,
        img,
        descricao,
        categoria,
        tagsArray,
        disponivel,
        id,
      ]
    );
    return result.rows.length ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

export async function deleteProduct(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

export default pool;
