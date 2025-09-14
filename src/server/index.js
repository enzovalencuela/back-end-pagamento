// src/server/index.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import {
  createTable,
  getBalance,
  addBalance,
  createUser,
  findUserByEmail,
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

// Rota para cadastro de usuário
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

// Rota para login de usuário
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
      },
    });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

app.get("/api/user/balance", async (req, res) => {
  const userId = 1;
  try {
    const balance = await getBalance(userId);
    res.status(200).json({ balance });
  } catch (error) {
    console.error("Erro ao buscar saldo:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Endpoint para buscar o saldo do usuário
app.get("/api/user/balance", async (req, res) => {
  try {
    const balance = await getBalance(userId);
    res.status(200).json({ balance });
  } catch (error) {
    console.error("Erro ao buscar saldo:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

// Endpoint para criar o pagamento (preferência de checkout)
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
        const newBalance = await addBalance(userId, amountPaid);

        console.log(
          `Saldo do usuário ${userId} atualizado. Novo saldo: R$${newBalance}`
        );
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

// Inicia a aplicação e a conexão com o banco de dados
const startApp = async () => {
  await createTable();
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
};

startApp();
