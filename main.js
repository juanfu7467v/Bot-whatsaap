// 📁 main.js (backend con Express para Railway usando WasenderAPI) const express = require('express'); const bodyParser = require('body-parser'); const axios = require('axios'); const cors = require('cors'); require('dotenv').config();

const app = express(); const PORT = process.env.PORT || 3000;

app.use(cors()); app.use(bodyParser.json());

// ✅ Ruta para enviar comandos al bot XDATA desde AppCreator 24 app.post('/enviar-comando', async (req, res) => { const { numero_usuario, comando } = req.body;

if (!numero_usuario || !comando) { return res.status(400).json({ error: 'Faltan campos requeridos' }); }

try { const response = await axios.post('https://wasenderapi.com/api/sendText', { phone: numero_usuario, message: comando, }, { headers: { Authorization: Bearer ${process.env.WASENDER_TOKEN}, 'Content-Type': 'application/json', }, });

res.json({ enviado: true, data: response.data });

} catch (err) { res.status(500).json({ error: 'Error al enviar comando', detalle: err.message }); } });

// ✅ Ruta webhook: Wasender enviará aquí los mensajes que recibe, incluido PDF o imagen app.post('/webhook', async (req, res) => { const data = req.body;

if (data?.message?.mimetype?.startsWith('image/') || data?.message?.mimetype === 'application/pdf') { const fileUrl = data.message.url; const tipo = data.message.mimetype; const numero = data.message.from;

// Aquí puedes guardar el archivo o reenviarlo a tu frontend (AppCreator 24)
console.log('📎 Archivo recibido:', fileUrl);

// Puedes responder aquí con una URL para tu plantilla
// En un caso real, guardarías esto en una BD temporal y AppCreator lo pediría

} else { console.log('📩 Texto recibido:', data?.message?.body); }

res.sendStatus(200); });

app.get('/', (req, res) => { res.send('Servidor WasenderAPI funcionando ✅'); });

app.listen(PORT, () => { console.log(Servidor activo en http://localhost:${PORT}); });

