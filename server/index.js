// 한판! 서버 - 정적 파일 + 초대 링크 OG 태그 + WebSocket 방 중계
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { RoomManager, newToken, publicRoom } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;
const APP_NAME = '한판!';

const app = express();
const indexHtml = readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const rooms = new RoomManager();

app.disable('x-powered-by');
app.set('trust proxy', true);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function originOf(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function setMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`);
  return html.replace(re, `$1${escapeHtml(content)}$2`);
}

function renderIndex(req, og = {}) {
  const origin = originOf(req);
  const title = og.title || `${APP_NAME} - 두뇌 보드게임 컬렉션`;
  const desc = og.description || '체스, 장기, 오셀로, 오목, 윷놀이까지. 친구와 온라인으로, 혹은 봇과 한판!';
  const url = og.url || origin + req.originalUrl;
  let html = indexHtml;
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', desc);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:image', origin + '/img/og.png');
  html = setMeta(html, 'name', 'description', desc);
  if (og.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(og.title)}</title>`);
  return html;
}

app.get('/', (req, res) => res.type('html').send(renderIndex(req)));
app.get('/join/:code', (req, res) => {
  const room = rooms.get(req.params.code);
  const og = room ? {
    title: `${room.hostName || '친구'}님이 ${room.gameName} 한판 하자고 초대했어요!`,
    description: `${APP_NAME}에서 바로 참여할 수 있어요. 앱 설치 없이 링크만 누르면 끝!`,
  } : {
    title: `${APP_NAME} - 초대 링크`,
    description: '이 방은 이미 끝났거나 만료됐어요. 새로 한판 시작해 보세요!',
  };
  res.type('html').send(renderIndex(req, og));
});
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ ok: false, error: '방을 찾을 수 없어요' });
  res.json({ ok: true, room: publicRoom(room, null) });
});
// 정적 배포판(GitHub Pages 등)이 서버를 깨울 때 다른 출처에서 호출하므로 CORS를 열어 둔다
app.get('/healthz', (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Cache-Control', 'no-store'); res.json({ ok: true, rooms: rooms.rooms.size }); });

app.use(express.static(PUBLIC_DIR, {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
// SPA 라우팅: 나머지는 index.html
app.get('*', (req, res) => {
  if (req.path.includes('.')) return res.status(404).end();
  res.type('html').send(renderIndex(req));
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ---- WebSocket ----
// ws.ctx = { token, name, code, seat (-1 = 관전) }

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except = null) {
  for (const client of wss.clients) {
    if (client.ctx && client.ctx.code === room.code && client !== except) send(client, msg);
  }
}

function syncRoom(room) {
  for (const client of wss.clients) {
    if (client.ctx && client.ctx.code === room.code) {
      send(client, { t: 'room', room: publicRoom(room, client.ctx.token), mySeat: client.ctx.seat });
    }
  }
}

function fail(ws, msg) { send(ws, { t: 'error', msg }); }

function cleanName(name) {
  const n = String(name || '').replace(/[\r\n\t<>]/g, '').trim().slice(0, 12);
  return n || '이름없음';
}

function seatOf(room, token) {
  return room.seats.findIndex(s => s.token === token);
}

function attach(ws, room, seat, token, name) {
  ws.ctx = { token, name, code: room.code, seat };
  if (seat >= 0) {
    Object.assign(room.seats[seat], { type: 'human', token, name, connected: true });
  } else {
    room.spectators.set(token, { name, connected: true });
  }
  room.emptySince = Date.now();
}

function detach(ws) {
  const ctx = ws.ctx;
  if (!ctx) return;
  const room = rooms.get(ctx.code);
  ws.ctx = null;
  if (!room) return;
  // 같은 토큰으로 이미 다른 소켓이 살아 있으면(새로고침 재접속 뒤 늦게 닫힌 예전 소켓) 자리 상태를 건드리지 않는다
  for (const c of wss.clients) if (c !== ws && c.ctx && c.ctx.token === ctx.token && c.readyState === c.OPEN) return;
  if (ctx.seat >= 0) {
    const s = room.seats[ctx.seat];
    if (s && s.token === ctx.token) {
      s.connected = false;
      // 아직 대기실이면 자리를 비워 다른 사람이 들어올 수 있게 (방장 자리는 유지)
      if (room.status === 'lobby' && room.hostToken !== ctx.token) {
        Object.assign(s, { type: 'open', token: null, name: '', connected: false });
      }
    }
  } else {
    const sp = room.spectators.get(ctx.token);
    if (sp) sp.connected = false;
  }
  const humansLeft = room.seats.some(s => s.type === 'human' && s.connected);
  if (!humansLeft) room.emptySince = Date.now();
  syncRoom(room);
}

const handlers = {
  create(ws, m) {
    detach(ws);
    const name = cleanName(m.name);
    if (!m.gameId || !Array.isArray(m.seats) || m.seats.length < 1 || m.seats.length > 8) return fail(ws, '잘못된 요청이에요');
    const room = rooms.create({ gameId: String(m.gameId).slice(0, 32), gameName: cleanName(m.gameName), options: m.options || {}, seats: m.seats, hostName: name });
    const token = newToken();
    room.hostToken = token;
    // 방장은 첫 번째 빈 자리에 앉는다
    let seat = room.seats.findIndex(s => s.type === 'open');
    if (seat < 0) { seat = 0; room.seats[0].type = 'open'; }
    attach(ws, room, seat, token, name);
    send(ws, { t: 'created', code: room.code, token, seat });
    syncRoom(room);
  },

  join(ws, m) {
    detach(ws);
    const room = rooms.get(m.code);
    if (!room) return fail(ws, '방을 찾을 수 없어요. 링크가 만료됐을 수 있어요.');
    const name = cleanName(m.name);
    const token = newToken();
    let seat = -1;
    if (room.status === 'lobby') seat = room.seats.findIndex(s => s.type === 'open');
    attach(ws, room, seat, token, name);
    send(ws, { t: 'joined', code: room.code, token, seat });
    syncRoom(room);
    if (seat >= 0) broadcast(room, { t: 'notice', text: `${name}님이 들어왔어요` }, ws);
  },

  rejoin(ws, m) {
    detach(ws);
    const room = rooms.get(m.code);
    if (!room) return fail(ws, '방이 사라졌어요. 새로 시작해 주세요.');
    for (const c of wss.clients) if (c !== ws && c.ctx && c.ctx.token === m.token) { c.ctx = null; try { c.close(); } catch { /* */ } }
    const seat = seatOf(room, m.token);
    if (seat >= 0) {
      const s = room.seats[seat];
      s.connected = true;
      ws.ctx = { token: m.token, name: s.name, code: room.code, seat };
      send(ws, { t: 'joined', code: room.code, token: m.token, seat, rejoined: true });
      syncRoom(room);
      broadcast(room, { t: 'notice', text: `${s.name}님이 다시 접속했어요` }, ws);
    } else if (room.spectators.has(m.token)) {
      const sp = room.spectators.get(m.token);
      sp.connected = true;
      ws.ctx = { token: m.token, name: sp.name, code: room.code, seat: -1 };
      send(ws, { t: 'joined', code: room.code, token: m.token, seat: -1, rejoined: true });
      syncRoom(room);
    } else {
      // 토큰이 안 맞으면 그냥 새로 참가
      handlers.join(ws, { code: m.code, name: m.name });
    }
  },

  setSeat(ws, m) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.hostToken !== ws.ctx.token) return fail(ws, '방장만 바꿀 수 있어요');
    if (room.status !== 'lobby') return;
    const s = room.seats[m.index];
    if (!s || s.type === 'human') return;
    if (m.type === 'bot') Object.assign(s, { type: 'bot', level: Math.max(1, Math.min(3, (m.level | 0) || 2)), name: m.name ? cleanName(m.name) : `봇 ${m.index + 1}` });
    else Object.assign(s, { type: 'open', name: '', token: null, connected: false });
    syncRoom(room);
  },

  setOptions(ws, m) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.hostToken !== ws.ctx.token || room.status !== 'lobby') return;
    room.options = m.options || {};
    syncRoom(room);
  },

  start(ws) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.hostToken !== ws.ctx.token) return fail(ws, '방장만 시작할 수 있어요');
    if (room.status === 'playing') return;
    // 빈 자리는 봇으로 채운다
    room.seats.forEach((s, i) => { if (s.type === 'open') Object.assign(s, { type: 'bot', name: `봇 ${i + 1}`, level: 2 }); });
    room.status = 'playing';
    room.seed = randomInt(1, 2 ** 31);
    room.moves = [];
    room.round += 1;
    room.rematchVotes.clear();
    broadcast(room, { t: 'start', seed: room.seed, round: room.round });
    syncRoom(room);
  },

  move(ws, m) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.status !== 'playing') return;
    if (ws.ctx.seat < 0) return fail(ws, '관전 중에는 둘 수 없어요');
    const seat = typeof m.seat === 'number' ? m.seat : ws.ctx.seat;
    // 봇 좌석은 방장만 대신 둘 수 있다
    if (seat !== ws.ctx.seat) {
      const s = room.seats[seat];
      if (!s || s.type !== 'bot' || room.hostToken !== ws.ctx.token) return fail(ws, '그 자리는 둘 수 없어요');
    }
    if (typeof m.idx === 'number' && m.idx !== room.moves.length) {
      // 이미 반영된 수(중복) 혹은 순서가 어긋난 수 → 무시하고 다시 동기화
      return send(ws, { t: 'room', room: publicRoom(room, ws.ctx.token), mySeat: ws.ctx.seat });
    }
    const entry = { seat, move: m.move, idx: room.moves.length };
    room.moves.push(entry);
    broadcast(room, { t: 'move', ...entry }, ws);
  },

  undo(ws, m) {
    // 무르기 합의 결과: count 만큼 로그에서 제거 (승인한 쪽이 보낸다)
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.status !== 'playing') return;
    const count = Math.max(1, Math.min(6, m.count | 0));
    room.moves.splice(Math.max(0, room.moves.length - count));
    broadcast(room, { t: 'undo', count, by: ws.ctx.seat });
  },

  relay(ws, m) {
    // 무르기 요청/응답, 이모티콘, 항복 등 클라이언트끼리 주고받는 메시지
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room) return;
    const payload = m.payload;
    if (!payload || typeof payload !== 'object') return;
    if (payload.text) payload.text = String(payload.text).slice(0, 200);
    broadcast(room, { t: 'relay', seat: ws.ctx.seat, name: ws.ctx.name, payload }, ws);
  },

  gameOver(ws) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.status !== 'playing') return;
    room.status = 'over';
    room.rematchVotes.clear();
    syncRoom(room);
  },

  rematch(ws) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || ws.ctx.seat < 0) return;
    if (room.status === 'playing') room.status = 'over';
    room.rematchVotes.add(ws.ctx.seat);
    const humans = room.seats.map((s, i) => ({ s, i })).filter(x => x.s.type === 'human' && x.s.connected);
    const allAgreed = humans.every(x => room.rematchVotes.has(x.i));
    if (allAgreed) {
      // 자리를 한 칸씩 돌려서 선/후를 바꾼다
      room.seats.push(room.seats.shift());
      room.status = 'playing';
      room.seed = randomInt(1, 2 ** 31);
      room.moves = [];
      room.round += 1;
      room.rematchVotes.clear();
      // 접속 중인 소켓의 좌석 번호 갱신
      for (const client of wss.clients) {
        if (client.ctx && client.ctx.code === room.code && client.ctx.seat >= 0) client.ctx.seat = seatOf(room, client.ctx.token);
      }
      broadcast(room, { t: 'start', seed: room.seed, round: room.round });
    }
    syncRoom(room);
  },

  leave(ws) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    const ctx = ws.ctx;
    detach(ws);
    if (room && ctx && ctx.seat >= 0) {
      broadcast(room, { t: 'notice', text: `${ctx.name}님이 나갔어요` });
      if (room.status !== 'lobby') {
        broadcast(room, { t: 'relay', seat: ctx.seat, name: ctx.name, payload: { kind: 'left' } });
      } else {
        const s = room.seats[ctx.seat];
        if (s && s.token === ctx.token) Object.assign(s, { type: 'open', token: null, name: '', connected: false });
        syncRoom(room);
      }
    }
  },

  // 게임 중 연결이 끊긴 사람 자리를 봇으로 바꾼다 (방장만)
  botify(ws, m) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room || room.hostToken !== ws.ctx.token) return fail(ws, '방장만 바꿀 수 있어요');
    const s = room.seats[m.seat];
    if (!s || s.type !== 'human' || s.connected || s.token === room.hostToken) return;
    Object.assign(s, { type: 'bot', token: null, name: `${s.name}(봇)`, level: 2, connected: false });
    syncRoom(room);
  },

  // 전체 상태 다시 받기
  sync(ws) {
    const room = ws.ctx && rooms.get(ws.ctx.code);
    if (!room) return;
    send(ws, { t: 'room', room: publicRoom(room, ws.ctx.token), mySeat: ws.ctx.seat });
  },

  ping(ws) { send(ws, { t: 'pong' }); },
};

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const h = handlers[m.t];
    if (!h) return;
    try { h(ws, m); } catch (e) { fail(ws, e.message || '문제가 생겼어요'); }
  });
  ws.on('close', () => detach(ws));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(PORT, () => {
  console.log(`${APP_NAME} 서버 실행 중 → http://localhost:${PORT}`);
});
