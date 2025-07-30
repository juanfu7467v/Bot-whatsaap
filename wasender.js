app.post("/webhook/wasender", async (req, res) => {
  try {
    // Validación opcional de secret
    if (WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const payload = req.body || {};

    // Texto
    let responseText =
      payload.caption ||
      payload.text ||
      payload?.message?.text ||
      payload.body ||
      "(Mensaje recibido sin texto)";

    // Archivo PDF/imagen
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

    // Ahora intentamos asociar por ID (si Wasender lo manda)
    const id = payload?.idConsulta; // <- si puedes hacer que el ID viaje en el webhook

    if (id) {
      // Asociar a la consulta exacta
      await markResponded({
        id,
        responseText: fileUrl ? "Resultado con archivo adjunto" : responseText,
        responseRaw: JSON.stringify({ ...payload, fileUrl })
      });
    } else {
      // Fallback: última pendiente
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
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Error /webhook/wasender:", err);
    return res.status(500).json({ error: "Error processing webhook" });
  }
});
