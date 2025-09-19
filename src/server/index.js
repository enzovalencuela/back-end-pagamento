// src/server/index.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pool from "./database.js";
import { MercadoPagoConfig, Payment } from "mercadopago";
import {
  createUser,
  findUserByEmail,
  updateUserPassword,
  addToCart,
  removeFromCart,
  getCartByUserId,
  getAllProducts,
  getProductById,
  createTables,
  addProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "./database.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Servidor do back-end rodando!");
});

// --- Rotas de Autenticação ---

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
  }
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return res.status(409).json({ message: "Email já cadastrado." });
  }
  try {
    const newUser = await createUser(name, email, password);
    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await findUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Email ou senha incorretos." });
    }
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

// --- Rota de Alteração de Senha (Corrigida) ---

app.post("/api/user/change-password", async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "Dados incompletos." });
  }
  try {
    const user = await getBalance(userId); // Usa getBalance para buscar o usuário pelo ID
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    if (user.password !== currentPassword) {
      return res.status(401).json({ message: "Senha atual incorreta." });
    }
    const updatedUser = await updateUserPassword(userId, newPassword);
    if (updatedUser) {
      res.status(200).json({ message: "Senha alterada com sucesso." });
    } else {
      res.status(500).json({ message: "Erro ao atualizar a senha." });
    }
  } catch (error) {
    console.error("Erro ao alterar a senha:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

// --- Rota para Saldo do Usuário ---

app.get("/api/user/balance/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const balance = await getBalance(userId);
    res.status(200).json({ balance });
  } catch (error) {
    console.error("Erro ao buscar saldo:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.get("/api/user/payments", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "ID do usuário não fornecido." });
  }

  let dbClient;
  try {
    dbClient = await pool.connect();
    const result = await dbClient.query(
      "SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar pagamentos do usuário:", error);
    res.status(500).json({ error: "Erro ao buscar histórico de pagamentos." });
  } finally {
    if (dbClient) dbClient.release();
  }
});

// --- Rotas de Pagamento do Mercado Pago ---

app.post("/api/payments/create", async (req, res) => {
  const { items, user_id, email, payment_method, card_token } = req.body;
  const totalAmount = items.reduce((sum, i) => sum + i.unit_price, 0);

  if (!items || items.length === 0 || totalAmount <= 0) {
    return res
      .status(400)
      .json({ error: "Dados dos itens incompletos ou inválidos." });
  }

  try {
    const paymentClient = new Payment(client);

    const paymentPayload = {
      transaction_amount: totalAmount,
      description: "Compra no E-Commerce",
      payer: {
        email,
      },
      metadata: {
        user_id,
      },
    };

    // PIX
    if (payment_method === "pix") {
      paymentPayload.payment_method_id = "pix";
    }

    // Cartão
    if (payment_method === "card" && card_token) {
      paymentPayload.token = card_token;
      paymentPayload.payment_method_id = req.body.card_brand;
      paymentPayload.installments = 1;
    }

    const paymentResponse = await paymentClient.create(paymentPayload);

    res.status(200).json({
      payment: paymentResponse,
    });
  } catch (err) {
    console.error("Erro ao criar pagamento:", err);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
});

app.post("/api/payments/webhook", async (req, res) => {
  console.log("Webhook recebido:", req.body);

  const paymentId = req.body.data?.id || req.body.id;
  if (!paymentId) return res.status(400).send("No payment id");

  try {
    const paymentClient = new Payment(client);
    const paymentInfo = await paymentClient.get({ id: paymentId });
    if (!paymentInfo) return res.status(404).send("Pagamento não encontrado");

    const userId = paymentInfo.metadata?.user_id;
    const amount = paymentInfo.transaction_amount;
    const status = paymentInfo.status;

    const dbClient = await pool.connect();
    try {
      await dbClient.query(
        `INSERT INTO payments (user_id, amount, currency, status, provider, provider_payment_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (provider_payment_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [
          userId,
          amount,
          paymentInfo.currency_id,
          status,
          "mercadopago",
          paymentInfo.id,
        ]
      );

      if (status === "approved" && userId) {
        const check = await dbClient.query(
          "SELECT 1 FROM transactions WHERE provider_payment_id = $1",
          [paymentInfo.id]
        );

        if (check.rowCount === 0) {
          await dbClient.query("BEGIN");
          await dbClient.query(
            "UPDATE users SET balance = balance + $1 WHERE id = $2",
            [amount, userId]
          );
          await dbClient.query(
            `INSERT INTO transactions (user_id, amount, transaction_type, provider_payment_id)
             VALUES ($1,$2,$3,$4)`,
            [userId, amount, "credit", paymentInfo.id]
          );
          await dbClient.query("COMMIT");
        }
      }
    } catch (err) {
      await dbClient.query("ROLLBACK");
      console.error("Erro processando webhook:", err);
    } finally {
      dbClient.release();
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno");
  }
});

app.get("/api/payments/status/:id", async (req, res) => {
  const paymentId = req.params.id;

  try {
    const paymentClient = new Payment(client);
    const paymentInfo = await paymentClient.get({ id: paymentId });

    const dbClient = await pool.connect();
    let dbPayment = null;

    try {
      const result = await dbClient.query(
        "SELECT * FROM payments WHERE provider_payment_id = $1",
        [paymentId]
      );
      dbPayment = result.rows[0];

      if (!dbPayment) {
        const insert = await dbClient.query(
          `INSERT INTO payments (user_id, amount, currency, status, provider, provider_payment_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            paymentInfo.metadata?.user_id || null,
            paymentInfo.transaction_amount,
            paymentInfo.currency_id,
            paymentInfo.status,
            "mercadopago",
            paymentInfo.id,
          ]
        );
        dbPayment = insert.rows[0];
      } else if (dbPayment.status !== paymentInfo.status) {
        const update = await dbClient.query(
          `UPDATE payments SET status=$1, updated_at=NOW() WHERE provider_payment_id=$2 RETURNING *`,
          [paymentInfo.status, paymentInfo.id]
        );
        dbPayment = update.rows[0];
      }
    } finally {
      dbClient.release();
    }

    res.status(200).json({
      provider: paymentInfo,
      database: dbPayment,
    });
  } catch (err) {
    console.error("Erro ao buscar status:", err);
    res.status(500).json({ error: "Erro ao buscar status do pagamento" });
  }
});

// --- Rotas de Produtos ---

app.post("/api/products/add", async (req, res) => {
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
  } = req.body;

  const categoriasPermitidas = [
    "Áudio",
    "Periféricos",
    "Consoles",
    "Realidade VR",
    "Acessórios",
    "Notebooks",
    "Setups",
    "Monitor",
  ];

  if (!titulo || !preco || !img || !descricao || !categoria) {
    return res.status(400).json({ message: "Dados do produto incompletos." });
  }

  if (!categoriasPermitidas.includes(categoria)) {
    return res.status(400).json({
      message:
        "Categoria inválida. Por favor, selecione uma categoria da lista permitida.",
    });
  }

  try {
    const newProduct = await createProduct(req.body);
    res.status(201).json(newProduct);
  } catch (err) {
    console.error("Erro ao adicionar produto:", err.message);
    res.status(500).send("Server error");
  }
});

// Rota para obter todos os produtos
app.get("/api/products", async (req, res) => {
  try {
    const products = await getAllProducts();
    res.status(200).json(products);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.get("/api/products/search", async (req, res) => {
  const { q, categoria } = req.query;
  const params = [];
  let paramIndex = 1;

  const whereClauses = [];

  whereClauses.push("disponivel = true");

  if (q) {
    whereClauses.push(
      `(titulo ILIKE $${paramIndex} OR descricao ILIKE $${paramIndex} OR categoria ILIKE $${paramIndex} OR tags::text ILIKE $${paramIndex})`
    );
    params.push(`%${q}%`);
    paramIndex++;
  }

  if (categoria) {
    whereClauses.push(`categoria = $${paramIndex}`);
    params.push(categoria);
    paramIndex++;
  }

  let query = "SELECT * FROM products";
  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Erro na busca de produtos:", err);
    console.error("Query executada:", query, params);
    res.status(500).json({ message: "Erro interno do servidor na busca." });
  }
});

// Rota para obter um produto específico por ID
app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await getProductById(id);
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json(product);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.put("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const updatedProduct = await updateProduct(id, req.body);
    if (!updatedProduct) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json(updatedProduct);
  } catch (err) {
    console.error("Erro ao atualizar produto:", err.message);
    res.status(500).send("Server error");
  }
});

app.delete("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await deleteProduct(id);
    if (!deleted) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json({ message: "Produto removido com sucesso." });
  } catch (err) {
    console.error("Erro ao remover produto:", err.message);
    res.status(500).send("Server error");
  }
});

// --- Rotas de Carrinho ---

app.post("/api/cart/add", async (req, res) => {
  const { userId, productId } = req.body;
  if (!userId || !productId) {
    return res
      .status(400)
      .json({ message: "ID do usuário e do produto são obrigatórios." });
  }
  try {
    const cartItem = await addToCart(userId, productId);
    res.status(201).json(cartItem);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.post("/api/cart/remove", async (req, res) => {
  const { userId, productId } = req.body;
  if (!userId || !productId) {
    return res
      .status(400)
      .json({ message: "ID do usuário e do produto são obrigatórios." });
  }
  try {
    const removedItem = await removeFromCart(userId, productId);
    if (!removedItem) {
      return res
        .status(404)
        .json({ message: "Item não encontrado no carrinho." });
    }
    res.status(200).json({ message: "Produto removido com sucesso." });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.get("/api/cart/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const cartItems = await getCartByUserId(userId);
    res.status(200).json(cartItems);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Inicia a aplicação e a conexão com o banco de dados
const startApp = async () => {
  try {
    await createTables();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar a aplicação:", error);
  }
};

startApp();
