// ultramsg.js
import axios from "axios";

/**
 * Enviar mensaje de texto por UltraMsg
 * @param {string} instance - ID de instancia UltraMsg (ej: instance12345)
 * @param {string} token    - Token API de UltraMsg
 * @param {string} to       - Número destino con + (ej: +51974212489)
 * @param {string} message  - Texto a enviar
 */
export async function sendMessage({ instance, token, to, message }) {
  const url = `https://api.ultramsg.com/${instance}/messages/chat`;
  const body = { token, to, body: message };
  const resp = await axios.post(url, body, { timeout: 15000 });
  return resp.data;
}

/**
 * (Opcional) Enviar media (si lo necesitas en el futuro)
 * @param {string} instance
 * @param {string} token
 * @param {string} to
 * @param {string} mediaUrl - URL pública de la imagen/PDF
 * @param {string} caption  - Texto opcional
 */
export async function sendMedia({ instance, token, to, mediaUrl, caption }) {
  const url = `https://api.ultramsg.com/${instance}/messages/document`;
  const body = { token, to, document: mediaUrl, caption };
  const resp = await axios.post(url, body, { timeout: 20000 });
  return resp.data;
}
