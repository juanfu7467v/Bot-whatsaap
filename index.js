const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta para enviar comandos al bot
app.get("/enviar", async (req, res) => {
  const { numero, comando } = req.query;

  if (!numero || !comando) {
    return res.status(400).json({ error: "Faltan parámetros: numero o comando" });
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

    res.json({ estado: "Mensaje enviado", respuesta: response.data });
  } catch (error) {
    console.error("Error al enviar:", error?.response?.data || error.message);
    res.status(500).json({ error: "No se pudo enviar el mensaje", detalle: error?.response?.data || error.message });
  }
});

// Ruta para recibir respuestas del bot
app.post("/webhook", (req, res) => {
  const { number, message } = req.body;

  console.log("Mensaje recibido del bot:");
  console.log("Número:", number);
  console.log("Mensaje:", message);

  // Aquí puedes guardar en base de datos o reenviar a otro sistema

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor funcionando en el puerto ${PORT}`);
});
