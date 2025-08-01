require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

const ULTRA_INSTANCE_ID = process.env.INSTANCE_ID;
const ULTRA_TOKEN = process.env.TOKEN;
const BOT_NUMBER = process.env.BOT_NUMBER;

let ultimaRespuesta = null;

// Endpoint para enviar un comando al bot
app.post('/enviar-comando', async (req, res) => {
  const { comando } = req.body;

  try {
    const sendUrl = `https://api.ultramsg.com/${ULTRA_INSTANCE_ID}/messages/chat`;
    const payload = {
      to: BOT_NUMBER,
      body: comando
    };

    await axios.post(sendUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ULTRA_TOKEN}`
      }
    });

    res.json({ status: 'Mensaje enviado al bot', enviado: comando });
  } catch (error) {
    console.error('❌ Error al enviar:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al enviar mensaje al bot' });
  }
});

// Webhook para recibir la respuesta del bot
app.post('/webhook', (req, res) => {
  const msg = req.body;

  if (msg?.body && msg?.from === BOT_NUMBER) {
    ultimaRespuesta = {
      texto: msg.body,
      tipo: msg.type === 'image' ? 'imagen' :
            msg.type === 'document' ? 'pdf' : 'texto',
      url: msg.media ?? null
    };
  }

  res.sendStatus(200);
});

// Endpoint para AppCreator24
app.get('/respuesta', (req, res) => {
  if (ultimaRespuesta) {
    res.json(ultimaRespuesta);
  } else {
    res.json({ texto: 'Aún no hay respuesta del bot', tipo: 'texto' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
