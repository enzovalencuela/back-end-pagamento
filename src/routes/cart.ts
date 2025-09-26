// --- Rotas de Carrinho ---
import { app } from "../app";
import { addToCart, removeFromCart, getCartByUserId } from "../server/database";

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
  } catch (err: any) {
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
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

app.get("/api/cart/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const cartItems = await getCartByUserId(userId);
    res.status(200).json(cartItems);
  } catch (err: any) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});
