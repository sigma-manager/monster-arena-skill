'use strict';
/**
 * MonsterASP.NET Notes App — serwer HTTP (Node.js, bez frameworków).
 *
 * Wymagania MonsterASP.NET (IIS httpPlatformHandler):
 *  - nasłuch na process.env.PORT (port/named pipe nadawany dynamicznie przez IIS — patrz web.config),
 *  - brak build-stepu: wszystkie pliki + node_modules wgrywamy FTP do /wwwroot.
 *
 * Lokalnie:
 *   npm install
 *   cp .env.example .env   # i uzupełnij DB_* (albo zostaw puste — tryb bez bazy)
 *   npm start              # http://localhost:3000
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// --- .env (na serwerze zmienne ustawia web.config; .env tylko do dev) ---
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* brak .env — OK */ }
})();

const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error('Przekroczono limit ciała żądania.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Nieprawidłowy JSON.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ---------------- API ----------------
async function handleApi(req, res, pathname) {
  const seg = pathname.split('/').filter(Boolean); // ['api', 'items', '123']

  if (seg[1] === 'health' && req.method === 'GET') {
    const dbStatus = await db.ping();
    return sendJson(res, 200, {
      ok: true,
      db: dbStatus, // 'ok' | 'not-configured...' | 'error: ...'
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
    });
  }

  if (seg[1] === 'items') {
    const id = seg[2] ? Number(seg[2]) : null;
    if (seg[2] && (!Number.isInteger(id) || id <= 0)) {
      return sendJson(res, 400, { error: 'Nieprawidłowe id.' });
    }

    if (req.method === 'GET' && id === null) {
      return sendJson(res, 200, { items: await db.listItems() });
    }
    if (req.method === 'POST' && id === null) {
      const body = await readBody(req);
      const name = String(body.name ?? '').trim();
      if (name.length < 1 || name.length > 200) {
        return sendJson(res, 400, { error: 'Pole "name" musi mieć 1–200 znaków.' });
      }
      return sendJson(res, 201, await db.createItem(name));
    }
    if (req.method === 'PUT' && id !== null) {
      const body = await readBody(req);
      if (typeof body.done !== 'boolean') {
        return sendJson(res, 400, { error: 'Pole "done" musi być typu boolean.' });
      }
      const updated = await db.setItemDone(id, body.done);
      if (!updated) return sendJson(res, 404, { error: 'Nie znaleziono pozycji.' });
      return sendJson(res, 200, { id, done: body.done });
    }
    if (req.method === 'DELETE' && id !== null) {
      const removed = await db.deleteItem(id);
      if (!removed) return sendJson(res, 404, { error: 'Nie znaleziono pozycji.' });
      return sendJson(res, 200, { id, deleted: true });
    }
    return sendJson(res, 405, { error: 'Metoda niedozwolona.' });
  }

  return sendJson(res, 404, { error: 'Nieznany endpoint API.' });
}

// ---------------- statyki ----------------
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); // ochrona przed path traversal
    return res.end();
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — nie znaleziono pliku');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      return serveStatic(req, res, url.pathname);
    }
    try {
      await handleApi(req, res, url.pathname);
    } catch (e) {
      if (e && e.code === 'DB_UNAVAILABLE') {
        return sendJson(res, 503, {
          error: 'Baza danych niedostępna.',
          hint: 'Ustaw DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (lokalnie w .env, na serwerze w web.config) i zainstaluj mysql2.',
          details: String(e.message || e),
        });
      }
      const status = e && e.statusCode ? e.statusCode : 500;
      if (status >= 500) console.error('[api]', e);
      return sendJson(res, status, { error: String(e.message || 'Błąd wewnętrzny serwera.') });
    }
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Błąd wewnętrzny serwera.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[app] Nasłuch na porcie ${PORT} (pid ${process.pid}, node ${process.version})`);
  db.ping().then((s) => console.log(`[app] Baza danych: ${s}`));
});
