// --- Rotas de Produtos ---
import { Router } from "express";
import { pool } from "../index.js";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../server/database.js";

const router = Router();

router.post("/add", async (req, res) => {
  const {
    titulo,
    preco,
    preco_original,
    parcelamento,
    img,
    descricao,
    categoria,
    tags,
    cores,
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
  } catch (err: any) {
    console.error("Erro ao adicionar produto:", err.message);
    res.status(500).send("Server error");
  }
});

// Rota para obter todos os produtos
router.get("/", async (req, res) => {
  try {
    const products = await getAllProducts();
    res.status(200).json(products);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

router.get("/search", async (req, res) => {
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
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await getProductById(id);
    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json(product);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const updatedProduct = await updateProduct(id, req.body);
    if (!updatedProduct) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json(updatedProduct);
  } catch (err: any) {
    console.error("Erro ao atualizar produto:", err.message);
    res.status(500).send("Server error");
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await deleteProduct(id);
    if (!deleted) {
      return res.status(404).json({ message: "Produto não encontrado." });
    }
    res.status(200).json({ message: "Produto removido com sucesso." });
  } catch (err: any) {
    console.error("Erro ao remover produto:", err.message);
    res.status(500).send("Server error");
  }
});

export default router;
