#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development.
 *   node tools/serve.mjs [port=8301]
 * ES modules require http(s) – opening index.html via file:// does not work.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8301);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist bereits belegt (läuft das Spiel schon in einem anderen Fenster?).`);
    console.error(`Anderen Port verwenden:  npm start -- 8302   und dann http://localhost:8302 öffnen.`);
  } else {
    console.error(`Server konnte nicht starten: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`World Strategy läuft auf http://localhost:${PORT}  (alternativ http://127.0.0.1:${PORT})`);
  console.log('Dieses Fenster offen lassen, solange Sie spielen. Beenden mit Strg + C.');
});
