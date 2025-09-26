import { Router } from "express";
import { pool } from "../index.js";

const router = Router();

router.get("/total", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as total FROM payments WHERE status = 'approved'`
    );
    res.json({ total: parseInt(result.rows[0].total, 10) });
  } catch (error: any) {
    console.error("Erro ao buscar vendas total", error);
    res.status(500).json({ error: "Erro ao buscar total de vendas" });
  }
});

router.get("/revenue", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as revenue FROM payments WHERE status = 'approved'`
    );

    res.json({ revenue: parseFloat(result.rows[0].revenue) });
  } catch (error: any) {
    console.error("Erro ao buscar faturamento total", error);
    res.status(500).send("Erro ao buscar faturamento total");
  }
});

router.get("/weekly", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT
  DATE_TRUNC('week', created_at::timestamp) AS week,
  COUNT(*) AS total
FROM payments
WHERE status = 'approved'
GROUP BY week
ORDER BY week ASC;
`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar vendas semanais", error);
    res.status(500).send("Erro ao buscar vendas semanais");
  }
});

router.get("/products", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT
  item->>'title' AS product,
  SUM((item->>'quantity')::int) AS total
FROM payments,
LATERAL jsonb_array_elements(additional_info->'items') AS item
WHERE status = 'approved'
GROUP BY product
ORDER BY total DESC
LIMIT 10;
`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar produtos mais vendidos", error);
    res.status(500).send("Erro ao buscar produtos mais vendidos");
  }
});

router.get("/categories", async (req, res) => {
  try {
    const result = await pool.query(`
SELECT
  item->>'category_id' AS category,
  SUM((item->>'quantity')::int) AS total
FROM payments,
LATERAL jsonb_array_elements(additional_info->'items') AS item
WHERE status = 'approved'
GROUP BY category
ORDER BY total DESC;

    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar vendas por categoria", error);
    res.status(500).send("Erro ao buscar vendas por categoria");
  }
});

export default router;
