const axios = require("axios");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post("/enviar", async (req, res) => {
  const { numero_usuario, comando } = req.body;

  try {
    const respuesta = await axios.post(
      "https://wasenderapi.com/api/sendText",
      {
        telefono: numero_usuario,
        mensaje: comando,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WASENDER_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ resultado: respuesta.data });
  } catch (error) {
    console.error("Error al enviar mensaje:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al enviar mensaje." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
