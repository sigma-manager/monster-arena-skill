#!/usr/bin/env node
'use strict';
/**
 * db_exec.js — wykonywanie plików SQL / pojedynczych zapytań na zdalnej bazie
 * MySQL/MariaDB (np. MonsterASP.NET; wymaga włączonego "Remote Access" w panelu).
 *
 * Użycie:
 *   node db_exec.js --env-file .deploy.env sql/001_schema.sql [sql/002_seed.sql ...]
 *   node db_exec.js --env-file .deploy.env --query "SELECT VERSION() AS version"
 *   node db_exec.js --env-file .deploy.env --query "SHOW TABLES"
 *
 * Wymagany pakiet: mysql2  →  npm install mysql2
 * Zmienne (z pliku --env-file lub środowiska): DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME [DB_SSL=1]
 */
const fs = require('node:fs');

function parseArgs(argv) {
  const out = { envFile: '.deploy.env', query: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env-file') out.envFile = argv[++i];
    else if (a === '--query') out.query = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else out.files.push(a);
  }
  return out;
}

function loadEnvFile(file) {
  const env = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return env; // brak pliku — polegamy na zmiennych środowiskowych
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.query && args.files.length === 0)) {
  console.log('Użycie: node db_exec.js [--env-file .deploy.env] (--query "SQL" | plik1.sql [plik2.sql ...])');
  process.exit(args.help ? 0 : 2);
}

let mysql;
try {
  mysql = require('mysql2/promise');
} catch {
  console.error('[błąd] Brak pakietu mysql2. Zainstaluj: npm install mysql2');
  process.exit(1);
}

function env(name, envFile) {
  return envFile[name] !== undefined ? envFile[name] : process.env[name];
}

(async () => {
  const envFile = loadEnvFile(args.envFile);
  const cfg = {
    host: env('DB_HOST', envFile),
    port: Number(env('DB_PORT', envFile) || 3306),
    user: env('DB_USER', envFile),
    password: env('DB_PASSWORD', envFile),
    database: env('DB_NAME', envFile),
    multipleStatements: true,
    connectTimeout: 10000,
    charset: 'utf8mb4',
  };
  if (env('DB_SSL', envFile) === '1') cfg.ssl = { rejectUnauthorized: false };

  const keyMap = { DB_HOST: 'host', DB_USER: 'user', DB_NAME: 'database' };
  const missing = Object.keys(keyMap).filter((k) => !cfg[keyMap[k]]);
  if (missing.length) {
    console.error(`[błąd] Brakuje: ${missing.join(', ')} (w ${args.envFile} lub zmiennych środowiskowych)`);
    process.exit(1);
  }

  console.log(`[info] Łączę z ${cfg.host}:${cfg.port} / baza ${cfg.database} (user ${cfg.user})`);
  const conn = await mysql.createConnection(cfg);
  try {
    if (args.query) {
      const [rows] = await conn.query(args.query);
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    for (const file of args.files) {
      const sql = fs.readFileSync(file, 'utf8');
      const t0 = Date.now();
      const [result] = await conn.query(sql);
      // Przy multipleStatements result jest tablicą wyników cząstkowych (albo pojedynczym obiektem).
      const parts = Array.isArray(result) ? result : [result];
      const summary = parts
        .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
        .map((r) => `${r.affectedRows ?? 0} wierszy${r.info ? ` (${r.info})` : ''}`)
        .join('; ') || 'OK';
      console.log(`[ok] ${file}: ${summary} — ${Date.now() - t0} ms`);
    }
    console.log('[ok] Wszystkie pliki SQL wykonane.');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error(`[błąd] ${e.code || ''} ${e.message}`.trim());
  if (e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') {
    console.error('[wskazówka] Sprawdź DB_HOST/DB_PORT oraz czy "Remote Access" bazy jest włączony w panelu MonsterASP.');
  }
  process.exit(1);
});
