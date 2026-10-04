/**
 * @file server.mjs
 * @description Lightweight live-editing HTTP server for Delta Chat UI A/B comparison.
 * Serves the interactive workbench on http://localhost:4200.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4200);
const HOST = '127.0.0.1';
const allowedOrigins = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
const savePath = path.join(__dirname, 'saved-state.json');
const maxStateBytes = 256 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (!allowedOrigins.has(`http://${req.headers.host}`)) {
    sendJson(res, 403, { error: 'Editor host not allowed' });
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if ((url.pathname === '/' || url.pathname === '/index.html') && req.method === 'GET') {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch {
      sendJson(res, 500, { error: 'Editor page unavailable' });
    }
    return;
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    if ((req.headers.origin && !allowedOrigins.has(req.headers.origin)) ||
        !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      sendJson(res, 403, { error: 'Same-origin JSON request required' });
      return;
    }
    let size = 0;
    let oversized = false;
    const chunks = [];
    req.on('data', chunk => {
      if (oversized) return;
      size += chunk.length;
      if (size > maxStateBytes) {
        oversized = true;
        chunks.length = 0;
        sendJson(res, 413, { error: 'Editor state exceeds 256 KiB' });
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (oversized) return;
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        sendJson(res, 400, { error: 'Invalid editor state JSON' });
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        sendJson(res, 400, { error: 'Editor state must be an object' });
        return;
      }
      try {
        const temporary = `${savePath}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(temporary, savePath);
        sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
      } catch {
        sendJson(res, 500, { error: 'Could not save editor state' });
      }
    });
    return;
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    try {
      if (!fs.existsSync(savePath)) {
        sendJson(res, 200, { empty: true });
        return;
      }
      const state = fs.readFileSync(savePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(state);
    } catch {
      sendJson(res, 500, { error: 'Could not read editor state' });
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`[Delta Chat UI Live Editor] Running at http://${HOST}:${PORT}`);
});
