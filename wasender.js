// wasender.js
import axios from "axios";

const WASENDER_ENDPOINT = "https://wasenderapi.com/api/send-message";

/**
 * Envía un texto (comando) al número objetivo usando WasenderAPI.
 * - token: tu token Bearer de Wasender
 * - to: número destino, ejemplo "+51974212489" (con +)
 * - message: texto a enviar, ejemplo "/c4 01234567"
 */
export async function sendViaWasender({ token, to, message }) {
  const payload = {
    to,
    text: message // Wasender espera "text" (no "message")
  };

  const resp = await axios.post(WASENDER_ENDPOINT, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 15000
  });

  return resp.data;
}

// Export default también (por compatibilidad si haces import default)
export default sendViaWasender;
