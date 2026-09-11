// WebSocket 클라이언트 - 자동 재접속 + 방 재입장
export class Net {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.queue = [];
    this.backoff = 800;
    this.wantOpen = false;
    this.room = null;        // { code, token }
    this.connected = false;
    this.closedByUser = false;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }
  emit(type, data) {
    const set = this.listeners.get(type);
    if (set) for (const fn of [...set]) { try { fn(data); } catch (e) { console.error(e); } }
  }

  url() {
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.wsUrl) || '';
    if (cfg) return cfg.replace(/^http/, 'ws');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  // 온라인 대전을 쓸 수 있는 환경인가 (정적 호스팅이면 서버 주소가 따로 필요하다)
  get available() {
    const cfg = window.APP_CONFIG || {};
    if (cfg.wsUrl) return true;
    if (cfg.staticHost) return false;
    return !/\.github\.io$/i.test(location.hostname);
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return this.ready;
    this.wantOpen = true;
    this.closedByUser = false;
    this.ready = new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url()); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) { ws.close(); reject(new Error('서버에 연결할 수 없어요')); } }, 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        this.connected = true;
        this.backoff = 800;
        this.emit('open');
        // 방에 있었다면 다시 들어간다
        if (this.room && this.room.code && this.room.token) this.raw({ t: 'rejoin', code: this.room.code, token: this.room.token, name: this.room.name });
        for (const m of this.queue.splice(0)) this.raw(m);
        resolve();
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (!m || !m.t) return;
        if (m.t === 'created' || m.t === 'joined') this.room = { code: m.code, token: m.token, name: this.room?.name };
        this.emit(m.t, m);
        this.emit('*', m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        if (was) this.emit('close');
        if (this.wantOpen && !this.closedByUser) {
          setTimeout(() => this.connect().catch(() => {}), this.backoff);
          this.backoff = Math.min(8000, this.backoff * 1.6);
        }
        reject(new Error('연결이 끊어졌어요'));
      };
      ws.onerror = () => { /* onclose에서 처리 */ };
    });
    return this.ready;
  }

  raw(m) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  send(m) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else { this.queue.push(m); this.connect().catch(() => {}); }
  }

  // 요청-응답 헬퍼
  request(msg, okType, { timeout = 8000 } = {}) {
    return new Promise((resolve, reject) => {
      const offs = [];
      const done = (fn) => { offs.forEach((o) => o()); clearTimeout(timer); fn(); };
      const timer = setTimeout(() => done(() => reject(new Error('응답이 없어요. 네트워크를 확인해 주세요.'))), timeout);
      offs.push(this.on(okType, (m) => done(() => resolve(m))));
      offs.push(this.on('error', (m) => done(() => reject(new Error(m.msg || '오류')))));
      this.connect().then(() => this.raw(msg)).catch((e) => done(() => reject(e)));
    });
  }

  async create({ gameId, gameName, options, seats, name }) {
    this.room = null;
    const m = await this.request({ t: 'create', gameId, gameName, options, seats, name }, 'created');
    this.room = { code: m.code, token: m.token, name };
    return m;
  }
  async join(code, name) {
    this.room = null;
    const m = await this.request({ t: 'join', code, name }, 'joined');
    this.room = { code: m.code, token: m.token, name };
    return m;
  }
  async rejoin(code, token, name) {
    this.room = null;
    const m = await this.request({ t: 'rejoin', code, token, name }, 'joined');
    this.room = { code: m.code, token: m.token, name };
    return m;
  }

  leave() {
    if (this.room) this.raw({ t: 'leave' });
    this.room = null;
  }
  close() {
    this.closedByUser = true;
    this.wantOpen = false;
    this.room = null;
    if (this.ws) this.ws.close();
  }
}

export const net = new Net();
