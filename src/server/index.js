// src/server/index.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pool from "./database.js";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
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

// --- Rotas de Pagamento do Mercado Pago ---

app.post("/api/payments/create", async (req, res) => {
  try {
    const { title, unit_price, quantity } = req.body;
    if (
      !title ||
      !unit_price ||
      !quantity ||
      unit_price <= 0 ||
      quantity <= 0
    ) {
      return res.status(400).json({ error: "Dados do item inválidos." });
    }
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            title: title,
            unit_price: Number(unit_price),
            quantity: Number(quantity),
          },
        ],
        back_urls: {
          success:
            "https://pagamento-plataforma.vercel.app/status?payment_id={id}",
          failure:
            "https://pagamento-plataforma.vercel.app/status?payment_id={id}",
          pending:
            "https://pagamento-plataforma.vercel.app/status?payment_id={id}",
        },
        auto_return: "approved",
      },
    });
    res.status(200).json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error("Erro ao criar preferência de pagamento:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.post("/api/payments/webhook", async (req, res) => {
  console.log("Notificação de Webhook recebida:", req.body);
  const paymentId = req.body.data.id || req.body.id;
  if (req.body.type === "payment" && paymentId) {
    try {
      const paymentClient = new Payment(client);
      const paymentInfo = await paymentClient.get({ id: paymentId });
      console.log("Informações do pagamento:", paymentInfo);
      if (
        (paymentInfo && paymentInfo.status === "approved") ||
        paymentInfo.date_approved !== null
      ) {
        const amountPaid = paymentInfo.transaction_amount;
      }
    } catch (error) {
      console.error("Erro ao processar o webhook:", error);
    }
  }
  res.status(200).send("OK");
});

app.get("/api/payments/status/:id", async (req, res) => {
  try {
    const paymentId = req.params.id;
    const paymentClient = new Payment(client);
    const paymentInfo = await paymentClient.get({ id: paymentId });
    res.status(200).json(paymentInfo);
  } catch (error) {
    console.error("Erro ao buscar status do pagamento:", error);
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
