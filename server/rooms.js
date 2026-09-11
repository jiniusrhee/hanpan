// 방(room) 관리 - 게임 로직은 전혀 모르고, 좌석/무브 로그/재접속만 책임진다.
import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(I, O, 0, 1) 제외
const ROOM_TTL_MS = 30 * 60 * 1000;      // 사람이 아무도 없으면 30분 뒤 삭제
const MAX_ROOMS = 5000;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    setInterval(() => this.sweep(), 60 * 1000).unref();
  }

  newCode() {
    for (let tries = 0; tries < 100; tries++) {
      let code = '';
      const bytes = randomBytes(6);
      for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('방 코드를 만들 수 없어요');
  }

  create({ gameId, gameName, options, seats, hostName }) {
    if (this.rooms.size >= MAX_ROOMS) throw new Error('지금은 방이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    const code = this.newCode();
    const room = {
      code,
      gameId,
      gameName: gameName || gameId,
      options: options || {},
      seats: seats.map((s, i) => ({
        type: s.type === 'bot' ? 'bot' : 'open',   // 'open' | 'human' | 'bot'
        level: s.level || 2,
        name: s.type === 'bot' ? (s.name || `봇 ${i + 1}`) : '',
        token: null,
        connected: false,
      })),
      hostToken: null,
      hostName,
      status: 'lobby',          // lobby | playing | over
      seed: 0,
      moves: [],
      round: 0,
      rematchVotes: new Set(),
      spectators: new Map(),    // token -> {name, connected}
      createdAt: Date.now(),
      emptySince: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  remove(code) {
    this.rooms.delete(code);
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const anyone = room.seats.some(s => s.type === 'human' && s.connected) ||
        [...room.spectators.values()].some(s => s.connected);
      if (anyone) { room.emptySince = now; continue; }
      if (now - room.emptySince > ROOM_TTL_MS) this.rooms.delete(code);
    }
  }
}

export function newToken() {
  return randomBytes(16).toString('hex');
}

// 클라이언트에 보내도 되는 형태로 요약
export function publicRoom(room, forToken) {
  return {
    code: room.code,
    gameId: room.gameId,
    gameName: room.gameName,
    options: room.options,
    status: room.status,
    seed: room.seed,
    round: room.round,
    moves: room.moves,
    hostSeat: room.seats.findIndex(s => s.token && s.token === room.hostToken),
    isHost: !!forToken && forToken === room.hostToken,
    mySeat: room.seats.findIndex(s => s.token && s.token === forToken),
    seats: room.seats.map(s => ({
      type: s.type,
      level: s.level,
      name: s.name,
      connected: s.connected,
    })),
    spectators: [...room.spectators.values()].filter(s => s.connected).map(s => s.name),
    rematchVotes: [...room.rematchVotes],
  };
}
