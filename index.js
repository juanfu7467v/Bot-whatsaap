const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta GET para enviar comandos al bot
app.get("/enviar", async (req, res) => {
  const { numero, comando } = req.query;

  if (!numero || !comando) {
    return res.status(400).json({ error: "Faltan parámetros" });
  }

  try {
    const response = await axios.post(
      "https://wasenderapi.com/api/sendText",
      {
        apiKey: process.env.API_KEY,
        sender: process.env.SENDER,
        number: numero,
        message: comando
      }
    );
    res.json({ ok: true, response: response.data });
  } catch (error) {
    console.error(error?.response?.data || error.message);
    res.status(500).json({ error: "Error al enviar", detalle: error?.response?.data || error.message });
  }
});

// Ruta POST para recibir webhook del bot
app.post("/webhook", (req, res) => {
  const data = req.body;
  console.log("📥 Webhook recibido:", data);

  res.sendStatus(200); // Responde OK al bot
});

app.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en el puerto ${PORT}`);
});
