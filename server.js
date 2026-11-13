'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MAX_ROOM = 24;          // 每房最多人數（遊戲本身上限 20）
const MAX_ROOMS = 500;
const TICK_MS = 100;          // 快照廣播頻率（約 10 Hz）
const MAX_MSG = 2048;         // 單則訊息大小上限
const MIN_GAP = 40;           // 同一連線兩次 presence 最短間隔(ms)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'microphone=(self)'
    });
    res.end(buf);
  });
});

/* rooms: name -> { peers: Map(id -> {ws, d, ts}), dirty } */
const rooms = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });
let seq = 0;

function leave(c) {
  if (!c.room) return;
  const r = rooms.get(c.room);
  if (r) {
    r.peers.delete(c.id); r.dirty = true;
    if (!r.peers.size) rooms.delete(c.room);
  }
  c.room = null;
}

wss.on('connection', ws => {
  const c = { ws, id: 'p' + (++seq).toString(36) + Math.random().toString(36).slice(2, 5), room: null, last: 0, alive: true };
  ws.on('pong', () => { c.alive = true; });
  ws.send(JSON.stringify({ t: 'hi', id: c.id }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      const name = String(m.room || '').toLowerCase().replace(/[^a-z0-9\-]/g, '').slice(0, 24);
      if (!name) return;
      leave(c);
      let r = rooms.get(name);
      if (!r) {
        if (rooms.size >= MAX_ROOMS) { ws.send(JSON.stringify({ t: 'full' })); return; }
        r = { peers: new Map(), dirty: true }; rooms.set(name, r);
      }
      if (r.peers.size >= MAX_ROOM) { ws.send(JSON.stringify({ t: 'full' })); return; }
      c.room = name; r.peers.set(c.id, { ws, d: null }); r.dirty = true;
    } else if (m.t === 'p') {
      if (!c.room) return;
      const now = Date.now();
      if (now - c.last < MIN_GAP) return;
      c.last = now;
      if (typeof m.d !== 'object' || m.d === null || Array.isArray(m.d)) return;
      const r = rooms.get(c.room); if (!r) return;
      const e = r.peers.get(c.id); if (!e) return;
      e.d = m.d; r.dirty = true;
    }
  });
  ws.on('close', () => leave(c));
  ws.on('error', () => leave(c));
  ws._c = c;
});

/* 廣播房間快照 */
setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.dirty) continue;
    r.dirty = false;
    const list = [];
    for (const [id, e] of r.peers) list.push({ i: id, d: e.d });
    const msg = JSON.stringify({ t: 's', p: list });
    for (const e of r.peers.values()) if (e.ws.readyState === 1) e.ws.send(msg);
  }
}, TICK_MS);

/* 心跳：清掉斷線的連線（同時避免 Render 閒置斷線） */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._c && !ws._c.alive) { ws.terminate(); continue; }
    if (ws._c) ws._c.alive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => console.log('listening on ' + PORT));
process.on('SIGTERM', () => { wss.close(); server.close(() => process.exit(0)); });
