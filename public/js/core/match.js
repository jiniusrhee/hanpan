// 한 판의 진행을 관리한다: 상태, 차례, 봇 실행, 온라인 동기화, 무르기
import { moveKey } from './util.js';
import { runBot } from './bot.js';

// 애니메이션이 끝난 뒤 봇이 다음 수를 두기까지의 숨 고르기 시간
const BOT_GAP_MS = 220;

export class Match {
  /**
   * @param cfg {
   *   rules, gameId, options, seed,
   *   seats: [{ type:'human'|'bot', name, level, local }],   // local: 이 기기가 이 자리를 담당하는가
   *   mode: 'solo'|'bot'|'hotseat'|'online',
   *   net (online), isHost (online),
   *   hooks: { onState(state, events, prev, animate), onOver(status), onBotThinking(seat, on), onError(msg) }
   * }
   */
  constructor(cfg) {
    Object.assign(this, cfg);
    this.hooks = cfg.hooks || {};
    this.history = [];
    this.state = null;
    this.over = null;
    this.stopped = false;
    this.botSeq = 0;
    this.botTimer = null;
    this.locked = false;   // 애니메이션·커튼 중 입력 잠금
    this.lockUntil = 0;    // 애니메이션이 끝나는 시각 (봇도 이때까지 기다린다)
    this.lockTimer = null;
  }

  // 뷰가 애니메이션 동안 입력을 잠근다. 봇도 이 시간이 지난 뒤에 다음 수를 두므로 연출이 서로 잘리지 않는다.
  lock(ms) {
    const until = performance.now() + ms;
    if (until > this.lockUntil) this.lockUntil = until;
    this.locked = true;
    clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => { this.locked = false; }, Math.max(0, this.lockUntil - performance.now()));
  }

  start(seed = this.seed) {
    this.seed = seed;
    this.history = [];
    this.over = null;
    this.stopped = false;
    this.state = this.rules.init(this.options || {}, seed, this.seats.length);
    this.hooks.onState && this.hooks.onState(this.state, [], null, false);
    this.next();
  }

  get isOnline() { return this.mode === 'online'; }
  get moveCount() { return this.history.length; }

  seat(i) { return this.seats[i]; }
  isBotSeat(i) { return this.seats[i] && this.seats[i].type === 'bot'; }
  isLocalHuman(i) { const s = this.seats[i]; return !!s && s.type === 'human' && s.local; }
  isLocalBot(i) { const s = this.seats[i]; return !!s && s.type === 'bot' && (this.mode !== 'online' || this.isHost); }
  // 로컬 사람 좌석 중 하나 (보드 방향 결정 등에 사용)
  get localHumanSeats() { return this.seats.map((s, i) => (s.type === 'human' && s.local ? i : -1)).filter((i) => i >= 0); }

  canAct(seat = this.state.turn) {
    return !this.over && !this.locked && !this.stopped && this.state.turn === seat && this.isLocalHuman(seat);
  }

  legalMoves(state = this.state) { return this.rules.legalMoves(state); }

  isLegal(move, state = this.state) {
    if (!move || typeof move !== 'object') return false;
    if (this.rules.isLegal) { try { return !!this.rules.isLegal(state, move); } catch { return false; } }
    const k = moveKey(move);
    return this.rules.legalMoves(state).some((m) => moveKey(m) === k);
  }

  // 로컬 사람이 두는 수
  submit(move) {
    if (!this.canAct()) return false;
    if (!this.isLegal(move)) { this.hooks.onError && this.hooks.onError('둘 수 없는 수예요'); return false; }
    this.commit(move, this.state.turn, 'local');
    return true;
  }

  // 서버에서 온 수
  applyRemote(move, seat, idx) {
    if (this.over || this.stopped) return;
    if (typeof idx === 'number' && idx !== this.history.length) {
      // 순서가 어긋남 → 상위에서 전체 동기화 요청
      this.hooks.onDesync && this.hooks.onDesync(idx);
      return;
    }
    if (seat !== this.state.turn) { this.hooks.onDesync && this.hooks.onDesync(idx); return; }
    if (!this.isLegal(move)) { this.hooks.onDesync && this.hooks.onDesync(idx); return; }
    this.commit(move, seat, 'remote');
  }

  // 로그 전체로 상태 재구성 (재접속)
  replay(moves) {
    this.stopped = false;
    this.history = [];
    this.over = null;
    this.state = this.rules.init(this.options || {}, this.seed, this.seats.length);
    for (const e of moves) {
      if (!this.isLegal(e.move)) break;
      const prev = this.state;
      const res = this.rules.apply(prev, e.move);
      this.history.push({ state: prev, move: e.move, seat: e.seat });
      this.state = res.state;
    }
    this.hooks.onState && this.hooks.onState(this.state, [], null, false);
    this.checkOver() || this.next();
  }

  commit(move, seat, origin) {
    const prev = this.state;
    let res;
    try { res = this.rules.apply(prev, move); } catch (e) { console.error(e); this.hooks.onError && this.hooks.onError('수를 처리하지 못했어요'); return; }
    this.history.push({ state: prev, move, seat });
    this.state = res.state;
    if (this.isOnline && origin !== 'remote' && this.net) {
      this.net.send({ t: 'move', move, seat, idx: this.history.length - 1 });
    }
    this.hooks.onState && this.hooks.onState(this.state, res.events || [], prev, true);
    if (!this.checkOver()) this.next();
  }

  checkOver() {
    const st = this.rules.status(this.state);
    if (st.over) {
      this.over = st;
      this.hooks.onOver && this.hooks.onOver(st);
      return true;
    }
    return false;
  }

  next() {
    if (this.over || this.stopped) return;
    const seat = this.state.turn;
    if (this.isLocalBot(seat)) this.scheduleBot();
    else this.autoPassIfForced();
    this.hooks.onTurn && this.hooks.onTurn(seat);
  }

  // 둘 수 있는 수가 강제 패스 하나뿐이면(오셀로처럼) 사람이 누를 것이 없으므로 알아서 넘긴다.
  // 이게 없으면 그 좌석에서 판이 영구히 멈춘다.
  autoPassIfForced() {
    const meta = this.rules.meta || {};
    if (!meta.autoPass || !this.isLocalHuman(this.state.turn)) return false;
    const ms = this.legalMoves();
    if (ms.length !== 1 || !ms[0].pass) return false;
    const state = this.state, seat = this.state.turn, move = ms[0];
    clearTimeout(this.passTimer);
    this.passTimer = setTimeout(() => {
      if (this.stopped || this.over || this.state !== state) return;
      this.commit(move, seat, 'auto');
    }, Math.max(700, this.lockUntil - performance.now() + BOT_GAP_MS));
    return true;
  }

  scheduleBot() {
    const seat = this.state.turn;
    const token = ++this.botSeq;
    const level = this.seats[seat].level || 2;
    const state = this.state;
    const started = performance.now();
    this.hooks.onBotThinking && this.hooks.onBotThinking(seat, true);
    const minDelay = this.mode === 'online' ? 700 : 420 + Math.random() * 380;
    runBot(this.gameId, state, level, { seat }).then((move) => {
      // 생각이 끝났어도 (1) 최소 대기 시간과 (2) 진행 중인 애니메이션이 모두 끝날 때까지 기다린다.
      // 기다리지 않으면 윷 던지기·말 이동·돌 뒤집기 연출이 다음 수에 잘려서 말이 사라진 것처럼 보인다.
      const fire = () => {
        this.hooks.onBotThinking && this.hooks.onBotThinking(seat, false);
        if (move == null) {
          // 둘 수 없으면 (규칙상 패스가 없는 경우) 그냥 넘김 처리
          this.hooks.onError && this.hooks.onError('봇이 둘 수 있는 수가 없어요');
          return;
        }
        if (!this.isLegal(move)) {
          console.warn('봇이 잘못된 수를 골랐어요', move);
          const ms = this.legalMoves();
          if (!ms.length) return;
          this.commit(ms[0], seat, 'bot');
          return;
        }
        this.commit(move, seat, 'bot');
      };
      const tryFire = () => {
        if (token !== this.botSeq || this.stopped || this.over) return;
        if (this.state !== state) return;
        // 애니메이션이 끝날 때까지, 그리고 끝난 뒤 한숨 돌릴 만큼 더 기다린다
        const left = this.lockUntil - performance.now();
        if (left > 0) { this.botTimer = setTimeout(tryFire, left + BOT_GAP_MS); return; }
        if (this.locked) { this.botTimer = setTimeout(tryFire, 150); return; }  // 핫시트 커튼처럼 기한 없는 잠금
        fire();
      };
      this.botTimer = setTimeout(tryFire, Math.max(0, minDelay - (performance.now() - started)));
    }).catch((e) => {
      if (this.stopped) return;
      console.error(e);
      this.hooks.onBotThinking && this.hooks.onBotThinking(seat, false);
      // 워커 실패 시 무작위 수라도 둔다
      const ms = this.legalMoves();
      if (ms.length && this.state === state) this.commit(ms[(Math.random() * ms.length) | 0], seat, 'bot');
    });
  }

  // n수 무르기 (로컬 상태만 되돌림)
  undo(n = 1) {
    if (this.history.length === 0) return 0;
    this.botSeq++;
    clearTimeout(this.botTimer);
    clearTimeout(this.passTimer);
    let done = 0;
    while (done < n && this.history.length) {
      const h = this.history.pop();
      this.state = h.state;
      done++;
    }
    this.over = null;
    this.hooks.onBotThinking && this.hooks.onBotThinking(-1, false);
    this.hooks.onState && this.hooks.onState(this.state, [{ type: 'undo' }], null, false);
    this.next();
    return done;
  }

  // 사람 좌석이 다시 둘 차례가 될 때까지 되돌리려면 몇 수를 물러야 하는지
  undoCountForSeat(seat) {
    let n = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      n++;
      if (this.history[i].seat === seat) break;
    }
    return n;
  }

  forceOver(status) {
    if (this.over) return;
    this.botSeq++;
    clearTimeout(this.botTimer);
    clearTimeout(this.passTimer);
    this.over = status;
    this.hooks.onOver && this.hooks.onOver(status);
  }

  setSeat(i, patch) { Object.assign(this.seats[i], patch); if (!this.over) this.next(); }

  stop() {
    this.stopped = true;
    this.botSeq++;
    clearTimeout(this.botTimer);
  }
}
