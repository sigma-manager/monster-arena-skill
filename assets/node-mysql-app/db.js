'use strict';
/**
 * Warstwa bazy danych — MySQL/MariaDB (MonsterASP.NET) przez mysql2/promise.
 *
 * Cechy:
 *  - mysql2 ładowane leniwie: aplikacja WSTAJE nawet bez pakietu / konfiguracji
 *    (API odpowie wtedy 503 z podpowiedzią — wygodny pierwszy test po deployu),
 *  - ensureSchema(): idempotentne CREATE TABLE IF NOT EXISTS przy pierwszym użyciu,
 *  - pula połączeń z niskim limitem (plan Free ma 256 MB RAM).
 *
 * Konfiguracja przez zmienne środowiskowe:
 *   DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME [DB_SSL=1]
 * Lokalnie: plik .env (czytany w server.js). Na serwerze: <environmentVariables> w web.config.
 */
let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch {
  console.warn('[db] Brak pakietu mysql2 — tryb bez bazy. Zainstaluj: npm install');
}

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 4,
  connectTimeout: 8000,
  charset: 'utf8mb4',
};
if (process.env.DB_SSL === '1') config.ssl = { rejectUnauthorized: false };

const isConfigured = Boolean(mysql && config.host && config.user && config.database);

let pool = null;
let schemaReady = false;

function unavailable(why) {
  const e = new Error(why);
  e.code = 'DB_UNAVAILABLE';
  return e;
}

function getPool() {
  if (!mysql) throw unavailable('Brak pakietu mysql2 (uruchom: npm install).');
  if (!isConfigured) throw unavailable('Brak konfiguracji DB_HOST/DB_USER/DB_NAME.');
  if (!pool) pool = mysql.createPool(config);
  return pool;
}

// Dostosuj tabelę do swojej aplikacji (mirror w sql/001_schema.sql)
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function ensureSchema() {
  if (schemaReady) return;
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
}

async function withDb(fn) {
  await ensureSchema();
  return fn(getPool());
}

/** Szybki stan bazy dla /api/health. */
async function ping() {
  if (!mysql) return 'not-configured (brak mysql2)';
  if (!isConfigured) return 'not-configured';
  try {
    await getPool().query('SELECT 1');
    return 'ok';
  } catch (e) {
    return `error: ${e.code || e.message}`;
  }
}

const rowToDto = (r) => ({ id: r.id, name: r.name, done: !!r.done, createdAt: r.created_at });

async function listItems() {
  const [rows] = await withDb((p) =>
    p.query('SELECT id, name, done, created_at FROM items ORDER BY id DESC LIMIT 200'));
  return rows.map(rowToDto);
}

async function createItem(name) {
  const [res] = await withDb((p) => p.query('INSERT INTO items (name) VALUES (?)', [name]));
  return { id: res.insertId, name, done: false };
}

async function setItemDone(id, done) {
  const [res] = await withDb((p) =>
    p.query('UPDATE items SET done = ? WHERE id = ?', [done ? 1 : 0, id]));
  return res.affectedRows > 0;
}

async function deleteItem(id) {
  const [res] = await withDb((p) => p.query('DELETE FROM items WHERE id = ?', [id]));
  return res.affectedRows > 0;
}

module.exports = { ping, listItems, createItem, setItemDone, deleteItem };
