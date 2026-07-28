// サーバー通信。
// セッションは Cookie ではなく sessionStorage 上のトークンで管理し、Authorization ヘッダで送る。
// sessionStorage はタブ／ウィンドウごとに独立しているため、別ウィンドウで別の区分・役割を
// 同時に開いてもログインが混ざらない（Cookie共有による役割の取り違えを防ぐ）。
const TOKEN_KEY = 'lubo_token';

export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function setToken(t) { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); }

async function request(method, path, body) {
  const opt = { method, headers: {} };
  const t = getToken();
  if (t) opt.headers['Authorization'] = 'Bearer ' + t;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(path, opt);
  let data = null;
  try { data = await res.json(); } catch (e) { /* 空応答 */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `通信エラー (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  del: (p) => request('DELETE', p),
  login: async (loginId, password, scope) => {
    const r = await request('POST', '/api/session', { loginId, password, scope });
    setToken(r.token);
    return r;
  },
  logout: async () => { try { await request('DELETE', '/api/session'); } finally { setToken(null); } },
  me: () => request('GET', '/api/session'),
  demoAccounts: (scope) => request('GET', '/api/demo-accounts?scope=' + encodeURIComponent(scope || '')),
};
