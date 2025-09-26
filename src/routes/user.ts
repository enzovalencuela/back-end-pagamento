import { app, pool } from "../app.ts";
import {
  findUserByEmail,
  createUser,
  getBalance,
  updateUserPassword,
} from "../server/database.ts";

app.get("/", (req: any, res: any) => {
  res.send("Servidor do back-end rodando!");
});

// --- Rotas de Autenticação ---

app.post("/api/user/register", async (req: any, res: any) => {
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

app.post("/api/user/login", async (req, res) => {
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

app.post("/api/user/change-password", async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "Dados incompletos." });
  }
  try {
    const user = await getBalance(userId);
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

app.get("/api/user/payments", async (req, res) => {
  const userId = req.query.id;
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

app.delete("/api/user/payments/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "ID da compra não fornecido." });
  }

  let dbClient;
  try {
    dbClient = await pool.connect();

    const result = await dbClient.query("DELETE FROM payments WHERE id = $1", [
      id,
    ]);

    return res.status(200).json({ message: "Compra cancelada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar compra:", error);
    return res.status(500).json({ message: "Erro ao cancelar compra" });
  }
});

app.put("/api/users/:id/update-checkout-info", async (req, res) => {
  const { id } = req.params;
  const { phone, address, number, neighborhood, city, state, zip } = req.body;

  try {
    await pool.query(
      `UPDATE users SET phone = $1, address = $2, number = $3, neighborhood = $4, city = $5, state = $6, zip = $7 WHERE id = $8`,
      [phone, address, number, neighborhood, city, state, zip, id]
    );

    res
      .status(200)
      .json({ message: "Dados de checkout atualizados com sucesso" });
  } catch (err) {
    console.error("Erro ao atualizar dados do usuário:", err);
    res.status(500).json({ error: "Erro ao atualizar dados do usuário" });
  }
});
