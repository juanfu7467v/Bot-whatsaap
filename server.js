// server.js - UltraMsg version
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

import * as Ultra from "./ultramsg.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
// Algunos webhooks de Ultra pueden llegar como x-www-form-urlencoded:
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;
const ULTRA_INSTANCE = process.env.ULTRA_INSTANCE;
const ULTRA_TOKEN = process.env.ULTRA_TOKEN;
const BOT_NUMBER = process.env.BOT_NUMBER;      // Número del bot XDATA (+51...)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // opcional

// -------- Health --------
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "ultramsg-bridge",
    version: "1.0.0"
  });
});

// -------- Enviar comando al bot XDATA --------
// Body: { "command": "/c4 73622435", "userNumber": "+51987654321" }
app.post("/api/send", async (req, res) => {
  let id;
  try {
    if (!ULTRA_INSTANCE || !ULTRA_TOKEN) {
      return res.status(500).json({ error: "Missing ULTRA_INSTANCE/ULTRA_TOKEN" });
    }
    if (!BOT_NUMBER) {
      return res.status(500).json({ error: "Missing BOT_NUMBER env var" });
    }

    const { command, userNumber } = req.body || {};
    if (!command || typeof command !== "string" || command.trim().length < 2) {
      return res.status(400).json({ error: 'Send body like { "command": "/c4 01234567", "userNumber": "+51..." }' });
    }

    id = uuid();
    await createConversation({
      id,
      command: command.trim(),
      toNumber: BOT_NUMBER,
      userNumber: userNumber || null
    });

    // Enviar comando al bot XDATA
    await Ultra.sendMessage({
      instance: ULTRA_INSTANCE,
      token: ULTRA_TOKEN,
      to: BOT_NUMBER,
      message: command.trim()
    });

    await markSent({ id });
    res.status(202).json({ id, status: "sent" });
  } catch (err) {
    console.error("Error /api/send:", err?.response?.data || err.message);
    if (id) {
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      await markError({ id, errorMessage: msg });
    }
    res.status(500).json({ error: "Failed to send command" });
  }
});

// -------- Consultar resultado --------
// GET /api/result/:id
app.get("/api/result/:id", async (req, res) => {
  try {
    const row = await getConversation(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });

    let fileUrl = null;
    try {
      const raw = row.response_raw ? JSON.parse(row.response_raw) : null;
      if (raw) {
        // Ultra normalmente manda 'media' (URL). También contemplamos 'mediaUrl' por compatibilidad.
        fileUrl = raw.media || raw.mediaUrl || raw.fileUrl || null;
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
      user_number: row.user_number,
      created_at: row.created_at,
      sent_at: row.sent_at,
      responded_at: row.responded_at
    });
  } catch (err) {
    console.error("Error /api/result:", err);
    return res.status(500).json({ error: "Error fetching result" });
  }
});

// -------- Listado (debug) --------
// GET /api/conversations?limit=20
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

// ===== Helpers de extracción desde webhook UltraMsg =====
function extractTextFromUltra(payload = {}) {
  // Ultra suele enviar 'body' como texto. A veces 'caption' para media.
  return payload.body || payload.caption || "(Mensaje recibido sin texto)";
}

function extractMediaUrlFromUltra(payload = {}) {
  // Ultra envía la URL en 'media'. Por compatibilidad añadimos 'mediaUrl' y 'url'
  return payload.media || payload.mediaUrl || payload.url || null;
}

// -------- Webhook de UltraMsg --------
// Configúralo en tu panel UltraMsg: POST → https://TU-APP.up.railway.app/webhook/ultramsg
app.post("/webhook/ultramsg", async (req, res) => {
  try {
    if (WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // Ultra puede enviar en JSON o x-www-form-urlencoded
    const payload = Object.keys(req.body || {}).length ? req.body : {};
    // Si llega como form-data/x-www-form-urlencoded, campos típicos: from, to, body, type, media, caption...
    const responseText = extractTextFromUltra(payload);
    const mediaUrl = extractMediaUrlFromUltra(payload);

    // Asociar a la última conversación pendiente
    const pending = await getLastUnanswered();
    if (!pending) {
      console.warn("Webhook Ultra: no hay conversación 'sent/created' pendiente");
      return res.sendStatus(200);
    }

    // Guardar resultado
    await markResponded({
      id: pending.id,
      responseText: mediaUrl ? "Resultado con archivo adjunto" : responseText,
      responseRaw: JSON.stringify({ ...payload, mediaUrl })
    });

    // Aviso al usuario (desde TU número conectado a UltraMsg), SIN mostrar el número del bot XDATA
    if (pending.user_number) {
      const aviso = mediaUrl
        ? `Hemos recibido tu resultado. Abrir archivo: ${mediaUrl}`
        : `Resultado: ${responseText}`;

      try {
        await Ultra.sendMessage({
          instance: ULTRA_INSTANCE,
          token: ULTRA_TOKEN,
          to: pending.user_number,
          message: aviso
        });
      } catch (e) {
        console.error("Error reenviando aviso al usuario:", e?.response?.data || e.message);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error /webhook/ultramsg:", err);
    return res.status(500).json({ error: "Error processing webhook" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
