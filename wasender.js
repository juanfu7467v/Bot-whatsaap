import axios from "axios";

const WASENDER_ENDPOINT = "https://api.wasenderapi.com/send-message";

/**
 * Envía un comando al número objetivo (bot) usando WasenderAPI.
 * Ajusta el payload según el contrato real de tu cuenta Wasender.
 */
export async function sendViaWasender({ token, to, message }) {
  // Ejemplo simple: { token, to, message }
  const payload = { token, to, message };

  const resp = await axios.post(WASENDER_ENDPOINT, payload, {
    timeout: 15000
  });

  // Puedes loguear resp.data para ver la forma real y guardar IDs si los hay
  return resp.data;
}
