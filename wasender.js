app.post("/webhook/wasender", async (req, res) => {
  try {
    const payload = req.body || {};

    // Texto
    const responseText = payload.caption || payload.text || payload.message?.text || "(Mensaje recibido sin texto)";

    // URL del archivo (PDF o imagen)
    const fileUrl =
      payload.mediaUrl ||
      payload.fileUrl ||
      payload.document?.url ||
      payload.media?.url ||
      payload.message?.mediaUrl ||
      null;

    const lastUnanswered = await getLastUnanswered();
    if (!lastUnanswered) {
      console.warn("Webhook recibido sin consultas pendientes");
      return res.sendStatus(200);
    }

    await markResponded({
      id: lastUnanswered.id,
      responseText: fileUrl ? "Resultado con archivo adjunto" : responseText,
      responseRaw: JSON.stringify({ ...payload, fileUrl })
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Error webhook:", err);
    res.sendStatus(500);
  }
});
