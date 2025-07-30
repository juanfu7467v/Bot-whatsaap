import axios from "axios";

const WASENDER_ENDPOINT = "https://api.wasenderapi.com/send-message";

/**
 * Envía un comando al número objetivo (bot) usando WasenderAPI.
 * Ahora el token va en el HEADER Authorization.
 */
export async function sendViaWasender({ token, to, message }) {
  const payload = {
    to,
    message
  };

  const resp = await axios.post(WASENDER_ENDPOINT, payload, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 15000
  });

  return resp.data;
}
