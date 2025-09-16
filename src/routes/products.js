// routes/products.js

import pool from "../server/database";
import { products } from "./data/products.js";

app.post("/api/seed/products", async (req, res) => {
  try {
    for (const product of products) {
      await pool.query(
        "INSERT INTO products (titulo, preco, preco_original, parcelamento, img, descricao) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          product.titulo,
          product.preco,
          product.precoOriginal,
          product.parcelamento,
          product.img,
          product.descricao,
        ]
      );
    }
    res.status(201).json({ message: "Produtos inseridos com sucesso!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erro ao popular o banco de dados.");
  }
});
