// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";

// Asegúrate que db.js esté en el mismo directorio y exporte estas funciones
import {
  createConversation,
  markSent,
  markResponded,
  markError,
  getConversation,
  listConversations,
  getLastUnanswered
} from "./db.js";

// Import robusto: funciona si wasender.js exporta named o default
import * as Wasender from "./wasender.js";
const sendViaWasender = Wasender.sendViaWasender ?? Wasender.default;
if (typeof sendViaWasender !== "function") {
  throw new Error("wasender.js debe exportar 'sendViaWasender' o 'default'");
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const BOT_NUMBER = process.env.BOT_NUMBER; // Ej: "+51974212489"
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // opcional

// Health
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "wasender-railway-bridge",
    version: "1.0.2"
  });
});

/**
 * Enviar comando al bot
 * Body: { "command": "/c4 01234567" }
 * Responde: { id, status: "sent" }
 */
app.post("/api/send", async (req, res) => {
  try {
    if (!WASENDER_TOKEN) {
      return res.status(500).json({ error: "Missing WASENDER_TOKEN env var" });
    }
    if (!BOT_NUMBER) {
      return res.status(500).json({ error: "Missing BOT_NUMBER env var" });
    }

    const { command } = req.body || {};
    if (!command || typeof command !== "string" || command.trim().length < 2) {
      return res.status(400).json({ error: 'Send body like { "command": "/c4 01234567" }' });
    }

    const id = uuid();

    await createConversation({ id, command: command.trim(), toNumber: BOT_NUMBER });

    // Enviar por WasenderAPI
    await sendViaWasender({
      token: WASENDER_TOKEN,
      to: BOT_NUMBER,            // Debe ser el número del bot XDATA (con +)
      message: command.trim()
    });

    await markSent({ id });

    return res.status(202).json({ id, status: "sent" });
  } catch (err) {
    console.error("Error /api/send:", err?.response?.data || err.message);
    // Si alcanzaste a crear la conversación y enviar falló, marca error
    try {
      if (err?.config?.data) {
        const parsed = JSON.parse(err.config.data);
        // no tenemos id aquí salvo que haya fallado después del insert...
      }
    } catch {}
    return res.status(500).json({
      error: "Failed to send command to WasenderAPI",
      details: err?.response?.data || err.message
    });
  }
});

/**
 * Consultar resultado
 * GET /api/result/:id
 * Devuelve response_text y file_url si hay archivo (PDF/imagen)
 */
app.get("/api/result/:id", async (req, res) => {
  try {
    const row = await getConversation(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });

    // extraer posible URL de media del payload crudo
    let fileUrl = null;
    try {
      const raw = row.response_raw ? JSON.parse(row.response_raw) : null;
      if (raw) {
        if (raw.fileUrl) fileUrl = raw.fileUrl;
        else if (raw.mediaUrl) fileUrl = raw.mediaUrl;
        else if (raw?.message?.fileUrl) fileUrl = raw.message.fileUrl;
        else if (raw?.message?.mediaUrl) fileUrl = raw.message.mediaUrl;
        else if (raw?.document?.url) fileUrl = raw.document.url;
        else if (raw?.media?.url) fileUrl = raw.media.url;
        // algunos proveedores usan "file" o "document" con "link"
        else if (raw?.file?.url) fileUrl = raw.file.url;
        else if (raw?.document?.link) fileUrl = raw.document.link;
      }
    } catch (e) {
      console.log("Cannot parse response_raw:", e?.message);
    }

    return res.json({
      id: row.id,
      command: row.command,
      status: row.status,
      response_text: row.response_text,
      file_url: fileUrl,
      created_at: row.created_at,
      sent_at: row.sent_at,
      responded_at: row.responded_at
    });
  } catch (err) {
    console.error("Error /api/result:", err);
    return res.status(500).json({ error: "Error fetching result" });
  }
});

/**
 * Listado (debug)
 * GET /api/conversations?limit=20
 */
app.get("/api/conversations", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const rows = await listConversations({ limit });
    return res.json(rows);
  } catch (err) {
    console.error("Error /api/conversations:", err);
    return res.status(500).json({ error: "Error listing conversations" });
  }
});

/**
 * Webhook entrante de WasenderAPI
 * Configura en Wasender: https://<tu-app>.railway.app/webhook/wasender
 * Header secreto opcional: X-Webhook-Secret: <WEBHOOK_SECRET>
 */
app.post("/webhook/wasender", async (req, res) => {
  try {
    // Validación opcional
    if (WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body || {};

    // Texto/caption
    let responseText =
      payload.caption ||
      payload.text ||
      payload?.message?.text ||
      payload.body ||
      "(Mensaje recibido sin texto)";

    // URL del archivo (PDF/imagen) — cubre variantes comunes
    const fileUrl =
      payload.fileUrl ||
      payload.mediaUrl ||
      payload?.message?.fileUrl ||
      payload?.message?.mediaUrl ||
      payload?.document?.url ||
      payload?.media?.url ||
      payload?.file?.url ||
      payload?.document?.link ||
      null;

    // Asociar a la última conversación pendiente (status='sent')
    const lastUnanswered = await getLastUnanswered();
    if (!lastUnanswered) {
      console.warn("Webhook recibido pero no hay conversación 'sent' pendiente");
      return res.sendStatus(200);
    }

    await markResponded({
      id: lastUnanswered.id,
      responseText: fileUrl ? "Resultado con archivo adjunto" : responseText,
      responseRaw: JSON.stringify({ ...payload, fileUrl })
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error /webhook/wasender:", err);
    return res.status(500).json({ error: "Error processing webhook" });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
