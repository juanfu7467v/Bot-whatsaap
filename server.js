// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  getConversation,
  getLastUnanswered,
  markResponded
} from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ================== Ruta básica (prueba de vida) ==================
app.get("/", (req, res) => {
  res.json({ ok: true, service: "wasender-railway-bridge", version: "1.0.3" });
});

// ================== Webhook de Wasender ==================
app.post("/webhook/wasender", async (req, res) => {
  try {
    // Si usas WEBHOOK_SECRET para validar que el POST viene de Wasender
    if (WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body || {};

    // Texto recibido
    const responseText =
      payload.caption ||
      payload.text ||
      payload?.message?.text ||
      payload.body ||
      "(Mensaje recibido sin texto)";

    // Detectar archivo adjunto (PDF o imagen)
    const fileUrl =
      payload.fileUrl ||
      payload.mediaUrl ||
      payload?.message?.fileUrl ||
      payload?.message?.mediaUrl ||
      payload?.document?.url ||
      payload?.document?.link ||
      payload?.media?.url ||
      payload?.file?.url ||
      null;

    // Buscar la última consulta en estado "sent"
    const lastUnanswered = await getLastUnanswered();
    if (!lastUnanswered) {
      console.warn("Webhook recibido pero no hay conversación 'sent' pendiente");
      return res.sendStatus(200);
    }

    // Marcar como respondido en la base de datos
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

// ================== Puerto ==================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
