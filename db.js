import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegura la carpeta ./data
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "data.db");
sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

// Crear tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      to_number TEXT NOT NULL,
      status TEXT NOT NULL,                 -- 'created' | 'sent' | 'responded' | 'error'
      response_text TEXT,
      response_raw TEXT,                    -- JSON string
      created_at INTEGER NOT NULL,          -- epoch ms
      sent_at INTEGER,
      responded_at INTEGER,
      error_message TEXT
    )
  `);
});

export function createConversation({ id, command, toNumber }) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    db.run(
      `INSERT INTO conversations (id, command, to_number, status, created_at) VALUES (?, ?, ?, 'created', ?)`,
      [id, command, toNumber, now],
      function (err) {
        if (err) return reject(err);
        resolve({ id });
      }
    );
  });
}

export function markSent({ id }) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    db.run(
      `UPDATE conversations SET status='sent', sent_at=? WHERE id=?`,
      [now, id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

export function markResponded({ id, responseText, responseRaw }) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    db.run(
      `UPDATE conversations
       SET status='responded', responded_at=?, response_text=?, response_raw=?
       WHERE id=?`,
      [now, responseText ?? null, responseRaw ?? null, id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

export function markError({ id, errorMessage }) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE conversations SET status='error', error_message=? WHERE id=?`,
      [errorMessage, id],
      function (err) {
        if (err) return reject(err);
        resolve(true);
      }
    );
  });
}

export function getConversation(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM conversations WHERE id=?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function getLastUnanswered() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM conversations
       WHERE status='sent'
       ORDER BY created_at DESC
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

export function listConversations({ limit = 50 }) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM conversations ORDER BY created_at DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}
