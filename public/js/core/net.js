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
    this.hooks = { wake: null };   // wake(phase, info): 'start' | 'stage' | 'done' | 'fail' — 깨우기 화면 연결용
    this.waking = null;
    this.warmed = false;
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

  // 서버의 HTTP 주소 (헬스 체크·깨우기용). wsUrl이 있으면 그 호스트, 없으면 현재 출처
  httpBase() {
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.wsUrl) || '';
    if (!cfg) return location.origin;
    try { const u = new URL(cfg.replace(/^ws/, 'http')); return u.origin; } catch { return location.origin; }
  }
  // 서버가 다른 출처(정적 배포판 + 별도 서버)인가 — 이때만 미리 깨워 둘 가치가 있다
  get remote() { return this.httpBase() !== location.origin; }

  // 헬스 체크 한 번 (서버가 잠들어 있으면 응답까지 수십 초가 걸릴 수 있어 넉넉히 기다린다)
  async ping(timeoutMs = 25000, holder = null) {
    const ctl = new AbortController();
    if (holder) holder.ctl = ctl;
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(this.httpBase() + '/healthz', { cache: 'no-store', signal: ctl.signal });
      return !!res && res.ok;
    } catch { return false; } finally { clearTimeout(timer); }
  }

  // 앱을 열 때 조용히 미리 깨워 두기 (사용자가 온라인을 고를 즈음엔 이미 깨어 있도록)
  prewarm() {
    if (!this.available || !this.remote || this.warmed) return;
    this.warmed = true;
    this.ping(60000).then((ok) => { if (!ok) this.warmed = false; }).catch(() => { this.warmed = false; });
  }

  // 연결을 보장한다. 1.2초 안에 붙지 않으면 '서버 깨우는 중' 화면을 띄우고 최대 100초까지 기다린다.
  ensure() {
    if (this.connected) return Promise.resolve();
    if (this.waking) return this.waking;
    const hook = (phase, info) => { try { this.hooks.wake && this.hooks.wake(phase, info); } catch { /* */ } };
    this.waking = (async () => {
      const quick = this.connect().then(() => true, () => false);
      const fast = await Promise.race([quick, new Promise((r) => setTimeout(() => r('slow'), 1200))]);
      if (fast === true) return;
      let cancelled = false;
      const holder = {};
      const cancelError = () => { const e = new Error('취소했어요'); e.cancelled = true; return e; };
      let wakeUp = null;
      const wait = (ms) => new Promise((r) => { wakeUp = r; setTimeout(r, ms); }); // 취소하면 바로 깨어나는 대기
      hook('start', { cancel: () => { cancelled = true; if (holder.ctl) holder.ctl.abort(); if (wakeUp) wakeUp(); } });
      const startedAt = Date.now();
      const LIMIT = 100000;
      try {
        // 1) HTTP로 깨우기: 응답이 올 때까지 반복
        hook('stage', '서버를 깨우는 중');
        let awake = false;
        while (!awake && !cancelled && Date.now() - startedAt < LIMIT) {
          awake = await this.ping(25000, holder);
          if (!awake && !cancelled) await wait(1500);
        }
        if (cancelled) throw cancelError();
        if (!awake) throw new Error('서버가 깨어나지 않아요. 잠시 뒤 다시 시도해 주세요.');
        // 2) 웹소켓 붙이기 (막 깨어난 직후엔 한두 번 실패할 수 있어 재시도)
        hook('stage', '연결하는 중');
        for (let i = 0; i < 6 && !cancelled; i++) {
          if (this.connected) break;
          if (await this.connect().then(() => true, () => false)) break;
          await wait(1200);
        }
        if (cancelled) throw cancelError();
        if (!this.connected) throw new Error('서버는 깨어났는데 연결이 되지 않아요. 잠시 뒤 다시 시도해 주세요.');
        hook('done');
      } catch (e) {
        hook('fail', e);
        throw e;
      }
    })().finally(() => { this.waking = null; });
    return this.waking;
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
      let timer = null;
      const done = (fn) => { offs.forEach((o) => o()); clearTimeout(timer); fn(); };
      offs.push(this.on(okType, (m) => done(() => resolve(m))));
      offs.push(this.on('error', (m) => done(() => reject(new Error(m.msg || '오류')))));
      // 연결(필요하면 서버 깨우기)이 끝난 뒤부터 응답 시간을 잰다
      this.ensure().then(() => {
        timer = setTimeout(() => done(() => reject(new Error('응답이 없어요. 네트워크를 확인해 주세요.'))), timeout);
        this.raw(msg);
      }).catch((e) => done(() => reject(e)));
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
