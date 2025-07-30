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

// Health check
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "wasender-railway-bridge",
    version: "1.0.1"
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
      return res.status(500).json({ error: "Missing WASENDER_TOKEN env var" });
    }
    if (!BOT_NUMBER) {
      return res.status(500).json({ error: "Missing BOT_NUMBER env var" });
    }

    const { command } = req.body || {};
    if (!command || typeof command !== "string" || command.trim().length < 2) {
      return res.status(400).json({ error: 'Send body like { "command": "/dni 75771998" }' });
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
    return res.status(500).json({
      error: "Failed to send command to WasenderAPI",
      details: err?.response?.data || err.message
    });
  }
});

/**
 * Consultar el estado o resultado
 * GET /api/result/:id
 * Devuelve response_text y, si hay media, file_url.
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
        if (raw.mediaUrl) fileUrl = raw.mediaUrl;
        else if (raw.fileUrl) fileUrl = raw.fileUrl;
        else if (raw?.message?.mediaUrl) fileUrl = raw.message.mediaUrl;
        else if (raw?.message?.fileUrl) fileUrl = raw.message.fileUrl;
        else if (raw?.media?.url) fileUrl = raw.media.url;
        else if (raw?.document?.url) fileUrl = raw.document.url;
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
 * Listar últimas conversaciones (debug)
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
 * Webhook entrante desde WasenderAPI
 * Configura en WasenderAPI para que envíe POST a:
 *   https://<your-app>.railway.app/webhook/wasender
 *
 * Valida header X-Webhook-Secret (si tu panel lo permite).
 * Guarda la respuesta y la asocia a la última conversación 'sent'.
 */
app.post("/webhook/wasender", async (req, res) => {
  try {
    const secret = req.header("X-Webhook-Secret");
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = req.body || {};
    const from = payload.from || payload.sender || payload?.message?.from;

    // texto visible si el proveedor manda texto/caption
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

    const lastUnanswered = await getLastUnanswered();
    if (!lastUnanswered) {
      console.warn("Webhook recibido, no hay conversación 'sent' pendiente");
      return res.sendStatus(200);
    }

    await markResponded({
      id: lastUnanswered.id,
      responseText,
      responseRaw: JSON.stringify(payload)
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
