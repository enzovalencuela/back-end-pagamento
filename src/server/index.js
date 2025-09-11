// src/server/index.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago"; // Adicionada a classe Payment
import { createTable, getBalance, addBalance } from "./database.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const userId = 1; // ID fixo do usuário para este exemplo

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// Middlewares
app.use(express.json());
app.use(cors());

// Rota de teste
app.get("/", (req, res) => {
  res.send("Servidor do back-end rodando!");
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
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "O valor do pagamento é inválido." });
    }

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            title: "Adicionar Saldo",
            unit_price: Number(amount),
            quantity: 1,
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
        // O Mercado Pago agora irá redirecionar o cliente imediatamente
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

// A rota de Webhook que o Mercado Pago irá chamar
app.post("/api/payments/webhook", async (req, res) => {
  console.log("Notificação de Webhook recebida:", req.body);

  // A notificação de pagamento real tem o ID no corpo
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
