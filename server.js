// server.js
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

import * as Wasender from "./wasender.js";
const sendViaWasender = Wasender.sendViaWasender ?? Wasender.default;
if (typeof sendViaWasender !== "function") {
  throw new Error("wasender.js debe exportar 'sendViaWasender' o 'default'");
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 8080;
const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const BOT_NUMBER = process.env.BOT_NUMBER;     // Ej: "+51974212489" (con +)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // opcional

// -------- Health --------
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "wasender-railway-bridge",
    version: "1.0.4"
  });
});

// -------- Enviar comando --------
// Body: { "command": "/c4 01234567" }
app.post("/api/send", async (req, res) => {
  let id;
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

    id = uuid();
    await createConversation({ id, command: command.trim(), toNumber: BOT_NUMBER });

    // Enviar a Wasender
    await sendViaWasender({
      token: WASENDER_TOKEN,
      to: BOT_NUMBER,
      message: command.trim()
    });

    await markSent({ id });
    return res.status(202).json({ id, status: "sent" });

  } catch (err) {
    const details = err?.response?.data || err?.message || "Unknown error";
    console.error("Error /api/send:", details);

    // Marca error para no dejar filas 'created' huérfanas
    if (id) {
      const msg = typeof details === "string" ? details : JSON.stringify(details);
      await markError({ id, errorMessage: msg });
    }

    // Manejo especial para rate-limit (free trial)
    // Wasender suele enviar { message: "...cada minuto", retry_after: <segundos> }
    const data = err?.response?.data;
    const retryAfter =
      data?.retry_after || data?.reintentar_despues || data?.reintentar_después || null;

    if (retryAfter !== null && retryAfter !== undefined) {
      return res.status(429).json({
        error: "rate_limited",
        message: "Estás en free trial: 1 mensaje por minuto.",
        retry_after: retryAfter
      });
    }

    return res.status(500).json({
      error: "Failed to send command to WasenderAPI",
      details: details
    });
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
        if (raw.fileUrl) fileUrl = raw.fileUrl;
        else if (raw.mediaUrl) fileUrl = raw.mediaUrl;
        else if (raw?.message?.fileUrl) fileUrl = raw.message.fileUrl;
        else if (raw?.message?.mediaUrl) fileUrl = raw.message.mediaUrl;
        else if (raw?.document?.url) fileUrl = raw.document.url;
        else if (raw?.document?.link) fileUrl = raw.document.link;
        else if (raw?.media?.url) fileUrl = raw.media.url;
        else if (raw?.file?.url) fileUrl = raw.file.url;
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

// -------- Listado (debug) --------
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

// ===== Helpers para texto/archivo (webhook) =====
function extractText(payload = {}) {
  if (typeof payload.message === "string") return payload.message;
  if (payload?.message?.text) return payload.message.text;
  if (payload.caption) return payload.caption;
  if (payload.text) return payload.text;
  if (payload.body) return payload.body;
  return "(Mensaje recibido sin texto)";
}

function extractFileUrl(payload = {}) {
  return (
    payload.fileUrl ||
    payload.mediaUrl ||
    payload?.message?.fileUrl ||
    payload?.message?.mediaUrl ||
    payload?.document?.url ||
    payload?.document?.link ||
    payload?.media?.url ||
    payload?.file?.url ||
    null
  );
}

// -------- Webhook de Wasender --------
app.post("/webhook/wasender", async (req, res) => {
  try {
    if (WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body || {};
    const responseText = extractText(payload);
    const fileUrl = extractFileUrl(payload);

    // Correlación por ID (si algún día Wasender incluye referencia del cliente)
    const candidateIds = [
      payload.idConsulta,
      payload.client_ref,
      payload.clientRef,
      payload.referenceId,
      payload.refId,
      payload.id,
      payload.messageId,
      payload?.context?.id,
      req.query?.id
    ].filter(Boolean);

    let targetId = null;
    if (candidateIds.length) {
      for (const cand of candidateIds) {
        try {
          const row = await getConversation(String(cand));
          if (row && (row.status === "sent" || row.status === "created")) {
            targetId = row.id;
            break;
          }
        } catch {}
      }
    }

    // Fallback: última 'sent' o 'created'
    if (!targetId) {
      const pending = await getLastUnanswered();
      if (!pending) {
        console.warn('Webhook recibido pero no hay conversación "sent/created" pendiente');
        return res.sendStatus(200);
      }
      targetId = pending.id;
    }

    await markResponded({
      id: targetId,
      responseText: fileUrl ? "Resultado con archivo adjunto" : responseText,
      responseRaw: JSON.stringify({ ...payload, fileUrl })
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error /webhook/wasender:", err);
    return res.status(500).json({ error: "Error processing webhook" });
  }
});

// -------- Listen --------
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
