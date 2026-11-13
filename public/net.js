/* 即時連線客戶端：提供與遊戲相同的 claude.use('room') 介面，底層走自家 WebSocket 伺服器。 */
(function () {
  if (window.claude && window.claude.use) return;
  const HZ_KEEP = 25000;
  let ws = null, ready = null, myId = null, retry = 0, closed = false;
  let current = null;            // 目前房間名
  let lastPresence = null;
  let peers = [];                // 伺服器最近一次快照
  let timer = null;

  function url() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function open() {
    return new Promise((res, rej) => {
      let done = false;
      try { ws = new WebSocket(url()); } catch (e) { rej(e); return; }
      const t = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (_) {} rej(new Error('timeout')); } }, 15000);
      ws.onopen = () => { retry = 0; if (current) send({ t: 'join', room: current }); };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.t === 'hi') { myId = m.id; if (!done) { done = true; clearTimeout(t); res(); } }
        else if (m.t === 's') { peers = m.p; }
        else if (m.t === 'full') { peers = []; }
      };
      ws.onclose = () => {
        peers = [];
        if (!done) { done = true; clearTimeout(t); rej(new Error('closed')); }
        if (closed) return;
        ready = null;
        if (current) { setTimeout(() => { ensure().catch(() => {}); }, Math.min(8000, 600 * Math.pow(1.7, retry++))); }
      };
      ws.onerror = () => {};
    });
  }
  function ensure() { return ready || (ready = open().catch(e => { ready = null; throw e; })); }

  const target = {
    peers() {
      return peers.map(p => ({
        peer: p.i, isMe: p.i === myId, sameTab: p.i === myId, kind: 'viewer', presence: p.i === myId ? lastPresence : p.d
      }));
    },
    presence(obj) {
      lastPresence = obj;
      send({ t: 'p', d: obj });
      return Promise.resolve();
    },
    async join(code) {
      await ensure();
      current = String(code);
      lastPresence = null; peers = [];
      send({ t: 'join', room: current });
      return target;
    }
  };
  const room = target;
  window.claude = { use: async name => { if (name !== 'room') throw new Error('unsupported'); await ensure(); return room; } };
  addEventListener('pagehide', () => { closed = true; try { ws && ws.close(); } catch (_) {} });
  void HZ_KEEP; void timer;
})();
