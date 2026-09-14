// 잠든 무료 서버(Render 등)를 흉내 내는 TCP 프록시: 첫 접속이 들어오면 --sleep ms 동안 아무 응답도 하지 않다가
// 그 뒤부터 --target 포트로 그대로 넘긴다. 깨우기 화면 테스트용.
// 사용: node tools/sleepy-proxy.js [--listen 3211] [--target 3210] [--sleep 15000]
import net from 'node:net';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const LISTEN = +arg('--listen', 3211), TARGET = +arg('--target', 3210), SLEEP = +arg('--sleep', 15000);
let wakeAt = 0;

const server = net.createServer((sock) => {
  if (!wakeAt) { wakeAt = Date.now() + SLEEP; console.log(`첫 접속 — ${SLEEP}ms 뒤에 깨어남`); }
  const pipe = () => {
    const up = net.connect(TARGET, '127.0.0.1');
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
    sock.pipe(up); up.pipe(sock);
  };
  const wait = wakeAt - Date.now();
  if (wait <= 0) pipe();
  else { sock.pause(); setTimeout(() => { if (!sock.destroyed) { sock.resume(); pipe(); } }, wait); }
});
server.listen(LISTEN, () => console.log(`sleepy proxy :${LISTEN} → :${TARGET} (sleep ${SLEEP}ms)`));
