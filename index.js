require("dotenv").config();
const express = require("express");
const axios = require("axios");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// Verificación webhook de Twilio (opcional)
app.get("/", (req, res) => {
  res.send("Servidor funcionando con Twilio API ✅");
});

app.post("/webhook", async (req, res) => {
  const msgBody = req.body.Body || "";
  const from = req.body.From || "";
  console.log("📩 Mensaje recibido:", msgBody);

  // Detectar comandos simples
  if (msgBody.startsWith("/dni ")) {
    const dni = msgBody.split(" ")[1];
    const linkResultado = `https://consulta.pe/api/dni/${dni}`; // ejemplo
    const respuesta = `🔍 Resultado para DNI ${dni}:\n👉 ${linkResultado}`;
    return res.send(`<Response><Message>${respuesta}</Message></Response>`);
  }

  if (msgBody.startsWith("/ficha ")) {
    const dni = msgBody.split(" ")[1];
    const urlPDF = `https://consulta.pe/api/ficha/${dni}.pdf`; // ejemplo
    return res.send(`
      <Response>
        <Message>
          Aquí está la ficha del DNI ${dni}:
          ${urlPDF}
        </Message>
      </Response>
    `);
  }

  // Respuesta por defecto
  return res.send(`<Response><Message>🤖 Hola, escribe un comando válido como /dni 12345678 o /ficha 12345678</Message></Response>`);
});

app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${port}`);
});
