const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let ultimoResultado = {
  tipo: null,
  contenido: null
};

// Enviar comando
app.post("/enviar", async (req, res) => {
  const { comando } = req.body;

  try {
    await axios.post(
      "https://wasenderapi.com/api/send-message",
      {
        to: process.env.BOT_NUMBER,
        text: comando
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ ok: true, mensaje: "Comando enviado" });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ ok: false, mensaje: "Error al enviar comando" });
  }
});

// Webhook: recibe respuestas del bot
app.post("/webhook", async (req, res) => {
  const data = req.body;
  const mensaje = data?.message?.text || null;
  const archivo = data?.message?.file_url || null;

  if (archivo) {
    const tipo = archivo.endsWith(".pdf") ? "pdf" : "imagen";
    ultimoResultado = {
      tipo,
      contenido: archivo
    };
  } else if (mensaje) {
    ultimoResultado = {
      tipo: "texto",
      contenido: mensaje
    };
  }

  res.sendStatus(200);
});

// Consultar resultado desde AppCreator
app.get("/resultado", (req, res) => {
  res.json(ultimoResultado);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
