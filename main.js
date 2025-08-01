require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

app.post('/enviar', async (req, res) => {
  const { numero, mensaje } = req.body;

  if (!numero || !mensaje) {
    return res.status(400).json({ error: 'Faltan datos: número o mensaje' });
  }

  try {
    const url = `https://api.ultramsg.com/${process.env.INSTANCE_ID}/messages/chat`;

    const payload = {
      token: process.env.ULTRAMSG_TOKEN,
      to: `+${numero}`,
      body: mensaje,
      priority: 10,
      referenceId: "msg-ref-" + Date.now()
    };

    const response = await axios.post(url, payload);

    return res.json({
      status: 'Mensaje enviado correctamente',
      data: response.data
    });
  } catch (error) {
    console.error('Error al enviar mensaje:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Error al enviar mensaje.' });
  }
});

// 🚨 Webhook para recibir respuestas del bot (texto, imagen o PDF)
app.post('/webhook', async (req, res) => {
  const data = req.body;

  console.log("📥 Mensaje recibido:");
  console.log(data);

  if (data.type === 'image') {
    console.log('🖼 Imagen:', data.caption, data.media);
  } else if (data.type === 'document') {
    console.log('📄 Documento:', data.caption, data.media);
  } else if (data.type === 'chat') {
    console.log('💬 Texto:', data.body);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
