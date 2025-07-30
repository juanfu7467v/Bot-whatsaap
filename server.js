app.get("/api/result/:id", async (req, res) => {
  try {
    const row = await getConversation(req.params.id);
    if (!row) return res.status(404).json({ error: "No encontrado" });

    // Parseamos el response_raw para ver si trae media
    let fileUrl = null;
    try {
      const raw = row.response_raw ? JSON.parse(row.response_raw) : null;

      // Si tiene mediaUrl o fileUrl lo extraemos
      if (raw && raw.mediaUrl) fileUrl = raw.mediaUrl;
      else if (raw && raw.fileUrl) fileUrl = raw.fileUrl;
      else if (raw && raw?.message?.mediaUrl) fileUrl = raw.message.mediaUrl;
      else if (raw && raw?.message?.fileUrl) fileUrl = raw.message.fileUrl;
    } catch (e) {
      console.log("No se pudo parsear el raw", e);
    }

    // Devolvemos un objeto simplificado con el file_url separado
    return res.json({
      id: row.id,
      command: row.command,
      status: row.status,
      response_text: row.response_text,
      file_url: fileUrl, // aquí viene el PDF/imagen si existe
      created_at: row.created_at,
      sent_at: row.sent_at,
      responded_at: row.responded_at
    });
  } catch (err) {
    console.error("Error /api/result:", err);
    return res.status(500).json({ error: "Error consultando resultado" });
  }
});
