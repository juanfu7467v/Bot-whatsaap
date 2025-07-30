// wasender.js
import axios from "axios";

const WASENDER_ENDPOINT = "https://wasenderapi.com/api/send-message";

/**
 * Envía un comando por WasenderAPI al número objetivo.
 * @param {Object} params
 * @param {string} params.token - Token Bearer de WasenderAPI
 * @param {string} params.to - Número destino con +, ej: "+51974212489"
 * @param {string} params.message - Mensaje o comando a enviar, ej: "/c4 01234567"
 */
export async function sendViaWasender({ token, to, message }) {
  const payload = {
    to,
    text: message // Wasender espera "text"
  };

  try {
    const resp = await axios.post(WASENDER_ENDPOINT, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    });

    return resp.data;
  } catch (err) {
    // Log del error completo para debugging
    console.error(
      "[WasenderAPI] Error al enviar:",
      err.response?.data || err.message
    );
    throw err;
  }
}

export default sendViaWasender;
