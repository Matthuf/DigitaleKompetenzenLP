// Lokaler Entwicklungsserver: bildet vercel.json (cleanUrls, Rewrites, /api) nach. Start: npm run dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import handler from './api/router.js';

const PORT = +process.env.PORT || 3000;
const PUB = path.resolve('public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = { route: url.pathname.slice(5) };
    return handler(req, res);
  }
  let p = url.pathname;
  if (/^\/t\/[^/]+$/.test(p) || p === '/mein-profil') p = '/teilnahme';
  if (/^\/einladung\/[^/]+$/.test(p)) p = '/einladung';
  if (p === '/') p = '/index';
  let file = path.join(PUB, p);
  if (!path.extname(file)) file += '.html';
  if (!file.startsWith(PUB) || !fs.existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', TYPES['.html']); return fs.createReadStream(path.join(PUB, '404.html')).pipe(res); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Lokal: http://localhost:${PORT}`));
