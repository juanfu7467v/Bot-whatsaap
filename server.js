// === Helpers para extraer texto y URL de archivo del payload ===
function extractText(payload = {}) {
  if (typeof payload.message === "string") return payload.message;
  if (payload?.message?.text) return payload.message.text;
  if (payload.caption) return payload.caption;
  if (payload.text) return payload.text;
  if (payload.body) return payload.body;
  return "(Mensaje recibido sin texto)";
}

function extractFileUrl(payload = {}) {
  // Cubrimos variantes comunes que envían proveedores/SDKs
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

// === WEBHOOK de WasenderAPI ===
// Configura en tu panel de WasenderAPI:
// URL (POST): https://TU-APP.up.railway.app/webhook/wasender
// Si usas WEBHOOK_SECRET en Railway, Wasender debe poder enviar el header X-Webhook-Secret
app.post("/webhook/wasender", async (req, res) => {
  try {
    // 1) Validación opcional con secreto compartido
    if (typeof WEBHOOK_SECRET !== "undefined" && WEBHOOK_SECRET) {
      const secret = req.header("X-Webhook-Secret");
      if (secret !== WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    // 2) Leemos el payload y extraemos texto + posible URL de archivo
    const payload = req.body || {};
    const responseText = extractText(payload);
    const fileUrl = extractFileUrl(payload);

    // 3) Intentar correlacionar por ID si viene en el webhook
    //    Ajusta/añade campos si tu proveedor incluye alguna referencia propia.
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

    // Si tu db.js expone getConversation, intenta validar el ID
    if (candidateIds.length) {
      for (const cand of candidateIds) {
        try {
          const row = await getConversation(cand);
          if (row && (row.status === "sent" || row.status === "created")) {
            targetId = row.id;
            break;
          }
        } catch (_) {
          // ignoramos errores por ID inexistente
        }
      }
    }

    // 4) Si no hubo ID válido, usar fallback: última conversación en 'sent'
    if (!targetId) {
      const lastUnanswered = await getLastUnanswered();
      if (!lastUnanswered) {
        console.warn('Webhook recibido pero no hay conversación "sent" pendiente');
        return res.sendStatus(200);
      }
      targetId = lastUnanswered.id;
    }

    // 5) Guardar respuesta en la conversación objetivo
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
