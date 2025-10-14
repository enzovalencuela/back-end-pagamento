import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import { MercadoPagoConfig } from "mercadopago";
import { createTables } from "./server/database.js";
import userRouter from "./routes/user.js";
import productsRouter from "./routes/products.js";
import paymentsRouter from "./routes/payments.js";
import cartRouter from "./routes/cart.js";
import salesRouter from "./routes/sales.js";

dotenv.config();

const PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3001;

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: PORT,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 5000,
});

const app = express();

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (!accessToken) {
  console.error(
    "ERRO FATAL: MERCADO_PAGO_ACCESS_TOKEN não está definido no ambiente."
  );
}

export const client = new MercadoPagoConfig({ accessToken: accessToken! });

app.use(express.json());

app.use(
  cors(/* {
    origin: "https://enzovalencuela-e-commerce.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
} */)
);

const setupPromise = createTables();

app.use(async (req, res, next) => {
  await setupPromise;
  next();
});

app.use("/api/user", userRouter);
app.use("/api/products", productsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/sales", salesRouter);

// Rota base
app.get("/", (req, res) => {
  res.status(200).send("API E-commerce rodando com sucesso!");
});

export default app;
