// --- Rotas de Pagamento do Mercado Pago ---
import { pool, client } from "../index.js";
import { Router } from "express";
import { Payment } from "mercadopago";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.post("/create", async (req, res) => {
  const {
    product_ids,
    user_id,
    payment_method_id,
    token,
    transaction_amount,
    installments,
    payer,
  } = req.body;

  const external_reference = uuidv4();

  const email = payer?.email;
  const cpf = payer?.identification?.number;

  console.log("Body recebido:", req.body);

  if (!product_ids || product_ids.length === 0 || !email) {
    return res.status(400).json({
      error: "Dados ausentes ou inválidos. O email é obrigatório.",
    });
  }

  const dbClient = await pool.connect();
  try {
    const { rows: users } = await dbClient.query(
      `SELECT id, name, email, cpf, phone, address, number, neighborhood, city, state, zip
   FROM users
   WHERE id = $1`,
      [user_id]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: "Usuário não encontrado." });
    }

    const user = users[0];

    const { rows: products } = await dbClient.query(
      "SELECT id, titulo, preco, categoria, descricao, img FROM products WHERE id = ANY($1::int[])",
      [product_ids]
    );

    if (products.length === 0) {
      return res.status(400).json({
        error: "Nenhum produto encontrado com os IDs fornecidos.",
      });
    }

    const totalAmount = products.reduce(
      (sum, product) => sum + Number(product.preco),
      0
    );

    if (transaction_amount <= 1 || totalAmount <= 1) {
      return res.status(400).json({
        error: "O valor total do pagamento deve ser maior que R$ 1,00.",
      });
    }

    const items = products.map((product) => ({
      id: product.id,
      title: product.titulo,
      description: product.descricao,
      category_id: product.categoria,
      quantity: 1,
      unit_price: product.preco,
      img: product.img,
    }));

    const paymentClient = new Payment(client);

    const paymentPayload: any = {
      transaction_amount: totalAmount,
      payment_method_id: payment_method_id,
      description: "Compra no E-Commerce",
      payer: {
        email: user.email,
        first_name: user.name,
        identification: {
          type: "CPF",
          number: user.cpf,
        },
        phone: {
          area_code: user.phone?.slice(0, 2) || "",
          number: user.phone?.slice(2) || "",
        },
        address: {
          street_name: user.address,
          street_number: user.number,
          neighborhood: user.neighborhood,
          city: user.city,
          federal_unit: user.state,
          zip_code: user.zip,
        },
      },
      metadata: { user_id: user.id },
      additional_info: {
        items,
        payer: {
          first_name: user.name,
          registration_date: new Date().toISOString(),
        },
      },
      external_reference,
      statement_descriptor: "E-Commerce Gamer",
    };

    if (token) {
      paymentPayload.token = token;
      paymentPayload.installments = installments || 1;
    }

    if (cpf) {
      paymentPayload.payer.identification = {
        type: "CPF",
        number: cpf,
      };
    }

    const paymentResponse = await paymentClient.create({
      body: paymentPayload,
    });

    res.status(200).json({ payment: paymentResponse });
  } catch (err) {
    console.error("Erro ao criar pagamento:", err);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  } finally {
    dbClient.release();
  }
});

router.post("/webhook", async (req, res) => {
  console.log("Webhook recebido:", req.body);

  const paymentId = req.body.data?.id || req.body.id;
  if (!paymentId) return res.status(400).send("No payment id");

  try {
    const paymentClient = new Payment(client);
    const paymentInfo = await paymentClient.get({ id: paymentId });
    if (!paymentInfo) return res.status(404).send("Pagamento não encontrado");

    const userId = paymentInfo.metadata?.user_id;
    const amount = paymentInfo.transaction_amount;
    const status = paymentInfo.status;
    const additional_info = paymentInfo.additional_info;
    const installments = paymentInfo.installments;

    const dbClient = await pool.connect();
    try {
      await dbClient.query(
        `INSERT INTO payments (user_id, amount, currency, status, provider, provider_payment_id, additional_info, installments)
         VALUES ($1,$2,$3,$4,$5,$6, $7, $8)
         ON CONFLICT (provider_payment_id)
         DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [
          userId,
          amount,
          paymentInfo.currency_id,
          status,
          "mercadopago",
          paymentInfo.id,
          additional_info,
          installments,
        ]
      );
    } catch (err) {
      await dbClient.query("ROLLBACK");
      console.error("Erro processando webhook:", err);
    } finally {
      dbClient.release();
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno");
  }
});

router.get("/:id/status", async (req, res) => {
  const paymentId = req.params.id;

  try {
    const paymentClient = new Payment(client);
    const paymentInfo = await paymentClient.get({ id: paymentId });

    const responseData: any = {
      id: paymentInfo.id,
      status: paymentInfo.status,
      status_detail: paymentInfo.status_detail,
      total_amount: paymentInfo.transaction_amount,
      payment_type: paymentInfo.payment_type_id,
      payment_method: paymentInfo.payment_method_id,
      date_approved: paymentInfo.date_approved,
      installments: paymentInfo.installments,
      additional_info: paymentInfo.additional_info,
    };

    if (
      paymentInfo.payment_type_id === "pix" &&
      paymentInfo.point_of_interaction
    ) {
      responseData.pix = {
        qr_code: paymentInfo.point_of_interaction.transaction_data?.qr_code,
        qr_code_base64:
          paymentInfo.point_of_interaction.transaction_data?.qr_code_base64,
        ticket_url:
          paymentInfo.point_of_interaction.transaction_data?.ticket_url,
      };
    }

    res.status(200).json({ payment: responseData });
  } catch (err) {
    console.error("Erro ao buscar status:", err);
    res.status(500).json({ error: "Erro ao buscar status do pagamento" });
  }
});

export default router;
