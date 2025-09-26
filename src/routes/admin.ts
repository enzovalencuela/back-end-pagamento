import app from "../index.js";
import { pool } from "../index.js";

app.get("/api/sales/total", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as total FROM payments WHERE status = 'approved`
    );
    res.json({ total: parseInt(result.rows[0].total, 10) });
  } catch (error: any) {
    console.error("Erro ao buscar vendas total", error);
    res.status(500).json({ error: "Erro ao buscar total de vendas" });
  }
});

app.get("/api/sales/revenue", async (req: any, res: any) => {
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

app.get("/api/sales/weekly", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT DATA_TRUNC('week', created_at) as week, COUNT(*) as total FROM payments WHERE status = 'approved' GROUP BY week ORDER BY week ASC`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar vendas semanais", error);
    res.status(500).send("Erro ao buscar vendas semanais");
  }
});

app.get("/api/sales/products", async (req: any, res: any) => {
  try {
    const result = await pool.query(
      `SELECT json_array_elements(additonal_info-> 'items')->>'title' as product, SUM((jsonb_array_elements(additional_info->'items')->>'quantity')::int) as total FROM payments WHERE status = 'approved' GROUP BY product ORDER BY total DESC LIMIT 10`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar produtos mais vendidos", error);
    res.status(500).send("Erro ao buscar produtos mais vendidos");
  }
});

app.get("/api/sales/categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        jsonb_array_elements(additional_info->'items')->>'category_id' as category,
        SUM((jsonb_array_elements(additional_info->'items')->>'quantity')::int) as total
      FROM payments
      WHERE status = 'approved'
      GROUP BY category
      ORDER BY total DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error("Erro ao buscar vendas por categoria", error);
    res.status(500).send("Erro ao buscar vendas por categoria");
  }
});
