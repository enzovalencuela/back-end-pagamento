// routes/products.js

import pool from "../server/database";
import productsToSeed from "../data/products.js";

app.post("/api/seed/products", async (req, res) => {
  try {
    for (const product of productsToSeed) {
      await pool.query(
        "INSERT INTO products (titulo, preco, preco_original, parcelamento, img, descricao, categoria, tags, disponivel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          product.titulo,
          product.preco,
          product.preco_original,
          product.parcelamento,
          product.img,
          product.descricao,
          product.categoria,
          product.tags,
          product.disponivel,
        ]
      );
    }
    res.status(201).json({ message: "Produtos inseridos com sucesso!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erro ao popular o banco de dados.");
  }
});
