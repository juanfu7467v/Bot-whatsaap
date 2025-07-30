import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import {
  createConversation,
  markSent,
  markResponded,
  markError,
  getConversation,
  listConversations,
  getLastUnanswered
} from "./db.js";
import { sendViaWasender } from "./wasender.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const BOT_NUMBER = process.env.BOT_NUMBER; // "51974212489"
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Salud
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "wasender-railway-bridge",
    version: "1.0.0"
  });
});

/**
 * Enviar comando al bot
 * Body: { command: "/dni 75771998" }
 * Respuesta: { id, status }
 */
app.post("/api/send", async (req, res) => {
  try {
    if (!WASENDER_TOKEN) {
      return res.status(500).json({ error: "Falta WASENDER_TOKEN en variables de entorno" });
    }
    if (!BOT_NUMBER) {
      return res.status(500).json({ error: "Falta BOT_NUMBER en variables de entorno" });
    }

    const { command } = req.body || {};
    if (!command || typeof command !== "string" || command.trim().length < 2) {
      return res.status(400).json({ error: "Debes enviar { command: \"...\" }" });
    }

    const id = uuid();

    await createConversation({ id, command: command.trim(), toNumber: BOT_NUMBER });

    // Enviar por WasenderAPI
    await sendViaWasender({
      token: WASENDER_TOKEN,
      to: BOT_NUMBER,
      message: command.trim()
    });

    await markSent({ id });

    return res.status(202).json({ id, status: "sent" });
  } catch (err) {
    console.error("Error /api/send:", err?.response?.data || err.message);
    // Si tenemos id en el scope anterior se podría marcar error. Aquí no está creado si falla antes.
    return res.status(500).json({
      error: "No se pudo enviar el comando a WasenderAPI",
      details: err?.response?.data || err.message
    });
  }
});

/**
 * Consultar el estado o resultado de una conversación
 * GET /api/result/:id
 */
app.get("/api/result/:id", async (req, res) => {
  try {
    const row = await getConversation(req.params.id);
    if (!row) return res.status(404).json({ error: "No encontrado" });
    return res.json(row);
  } catch (err) {
    console.error("Error /api/result:", err);
    return res.status(500).json({ error: "Error consultando resultado" });
  }
});

/**
 * Listar últimas conversaciones (para debug)
 * GET /api/conversations?limit=20
 */
app.get("/api/conversations", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const rows = await listConversations({ limit });
    return res.json(rows);
  } catch (err) {
    console.error("Error /api/conversations:", err);
    return res.status(500).json({ error: "Error listando conversaciones" });
  }
});

/**
 * Webhook entrante desde WasenderAPI
 * Configura en WasenderAPI para que envíe POST a:
 *   https://tu-app.up.railway.app/webhook/wasender
 *
 * Valida header X-Webhook-Secret (si tu panel lo permite).
 * Guarda la respuesta y la asocia a la última conversación 'sent'.
 */
app.post("/webhook/wasender", async (req, res) => {
  try {
    // Validación sencilla con secreto compartido (opcional)
    const secret = req.header("X-Webhook-Secret");
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // El payload exacto depende de WasenderAPI. Aceptamos esquemas comunes:
    // Ejemplos aceptados:
    // { from: "51974212489", message: "Texto..." }
    // { from: "51974212489", message: { text: "Texto...", type: "text" } }
    // { from: "51974212489", type: "image", caption: "algo", mediaUrl: "..." }
    const payload = req.body || {};
    const from = payload.from || payload.sender || payload?.message?.from;
    const isFromBot = from && String(from) === String(BOT_NUMBER);

    // Extraer texto de forma lo más genérica posible
    let responseText = "";
    if (typeof payload.message === "string") {
      responseText = payload.message;
    } else if (payload?.message?.text) {
      responseText = payload.message.text;
    } else if (payload?.text) {
      responseText = payload.text;
    } else if (payload?.caption) {
      responseText = payload.caption;
    } else if (payload?.body) {
      responseText = payload.body;
    } else {
      responseText = "(Mensaje recibido sin texto plano)";
    }

    // Asociar a la última conversación que esté en 'sent'
    const lastUnanswered = await getLastUnanswered();
    if (!lastUnanswered) {
      // No hay conversación pendiente; solo retornar 200
      console.warn("Webhook recibido, pero no hay conversación 'sent' pendiente");
      return res.sendStatus(200);
    }

    // Guardar
    await markResponded({
      id: lastUnanswered.id,
      responseText,
      responseRaw: JSON.stringify(payload)
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error /webhook/wasender:", err);
    return res.status(500).json({ error: "Error procesando webhook" });
  }
});

app.listen(PORT, () => {
  console.log(`API escuchando en puerto ${PORT}`);
});
