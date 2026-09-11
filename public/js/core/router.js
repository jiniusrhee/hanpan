// 아주 작은 경로 라우터 (history API). <base href>를 기준으로 동작해서
// 루트(/)나 하위 경로(/hanpan/ 같은 GitHub Pages)에서도 똑같이 쓸 수 있다.
const routes = [];
let cleanup = null;
let currentPath = null;

// 예: "/" 또는 "/hanpan/"
export const BASE = (() => {
  try { const p = new URL(document.baseURI).pathname; return p.endsWith('/') ? p : p.replace(/[^/]*$/, ''); } catch { return '/'; }
})();

// 앱 내부 경로("/room/ABC") → 실제 URL 경로("/hanpan/room/ABC")
export const withBase = (path) => BASE + String(path).replace(/^\//, '');
// 실제 URL 경로 → 앱 내부 경로
export function appPath(pathname = location.pathname) {
  let p = pathname;
  if (BASE !== '/' && p.startsWith(BASE.replace(/\/$/, ''))) p = p.slice(BASE.length - 1);
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^\\/]+)'; }) + '\\/?$');
  routes.push({ re, keys, handler });
}

export function navigate(path, { replace = false } = {}) {
  const url = withBase(path);
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  dispatch();
}

export function current() { return currentPath; }

export async function dispatch() {
  const path = appPath();
  currentPath = path;
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    window.scrollTo(0, 0);
    const res = await r.handler(params, new URLSearchParams(location.search));
    if (typeof res === 'function') cleanup = res;
    return;
  }
  navigate('/', { replace: true });
}

export function start() {
  window.addEventListener('popstate', dispatch);
  dispatch();
}
