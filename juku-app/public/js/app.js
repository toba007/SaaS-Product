import { api, getToken } from './api.js';
import { h, toast } from './ui.js';
import * as views from './views.js';

const root = document.getElementById('root');
const state = { user: null };

// このアプリの区分（URLパスで決まる）。/staff=講師・管理者、/family=生徒・保護者。
const SCOPE = location.pathname.startsWith('/staff') ? 'staff'
  : location.pathname.startsWith('/family') ? 'family' : null;
const SCOPE_INFO = {
  staff: { title: 'LuBo School｜管理画面', sub: '講師・管理者用', other: { label: '生徒・保護者用はこちら →', href: '/family' } },
  family: { title: 'LuBo School', sub: '生徒・保護者用', other: { label: '講師・スタッフ用はこちら →', href: '/staff' } },
};

// ナビ用の簡素な線アイコン（単色・控えめ。currentColor を継承）
const SVG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICONS = {
  dashboard: SVG('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  timetable: SVG('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="M7.5 13h3M7.5 16.5h3M13.5 13h3M13.5 16.5h3"/>'),
  checkins: SVG('<path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M10 8l4 4-4 4"/><path d="M14 12H4"/>'),
  records: SVG('<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M8 13h7M8 17h5"/>'),
  students: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.3 2.6-5.3 5.5-5.3s5.5 2 5.5 5.3"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.9c2 .6 3.5 2.3 3.5 5.1"/>'),
  teachers: SVG('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>'),
  notices: SVG('<path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 5.5 2 6H4c.5-.5 2-1.5 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>'),
  messages: SVG('<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M8 10h8M8 13h5"/>'),
  hub: SVG('<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M9.3 9.2a2.5 2.5 0 0 1 4 2c0 1-1 1.4-1.3 1.8"/><path d="M12 14.5h.01"/>'),
  questions: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.6 2.6 0 0 1 4.2 2c0 1.2-1.2 1.6-1.5 2.1"/><path d="M12 16.5h.01"/>'),
  consultations: SVG('<path d="M12 3a9 9 0 0 1 0 18 9 9 0 0 1-8-4.9L3 21l1.9-5.1"/><path d="M12 8v4M12 16h.01"/>'),
  supplementary: SVG('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="M12 12.5v5M9.5 15h5"/>'),
  account: SVG('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.7-1.3-1.8-3.1-2 .8a7.6 7.6 0 0 0-1.7-1l-.3-2.1H9.7l-.3 2.1a7.6 7.6 0 0 0-1.7 1l-2-.8L3.9 9.7 5.6 11a7.7 7.7 0 0 0 0 2l-1.7 1.3 1.8 3.1 2-.8a7.6 7.6 0 0 0 1.7 1l.3 2.1h4.6l.3-2.1a7.6 7.6 0 0 0 1.7-1l2 .8 1.8-3.1Z"/>'),
};

// ------------------------------------------------------------------
// ルート定義（順序が重要：具体的なものを先に）
// ------------------------------------------------------------------
const routes = [
  { re: /^\/?$/, view: views.dashboard, title: 'ダッシュボード' },
  { re: /^\/timetable$/, view: views.timetable, title: '時間割' },
  { re: /^\/records\/new$/, view: views.recordNew, title: '授業記録の作成' },
  { re: /^\/records\/([^/]+)$/, view: views.recordDetail, title: '授業記録', keys: ['id'] },
  { re: /^\/records$/, view: views.records, title: '授業記録' },
  { re: /^\/checkins\/cards$/, view: views.barcodeCards, title: 'バーコード印刷' },
  { re: /^\/checkins$/, view: views.checkins, title: '入退室' },
  { re: /^\/notifications$/, view: views.notifications, title: '通知' },
  { re: /^\/messages\/new$/, view: views.messageNew, title: '新規メッセージ' },
  { re: /^\/messages\/([^/]+)$/, view: views.messageThread, title: 'メッセージ', keys: ['id'] },
  { re: /^\/messages$/, view: views.messages, title: 'メッセージ' },
  { re: /^\/hub$/, view: views.hub, title: '質問・相談' },
  { re: /^\/questions\/new$/, view: views.questionNew, title: '質問する' },
  { re: /^\/questions\/([^/]+)$/, view: views.questionDetail, title: '質問', keys: ['id'] },
  { re: /^\/questions$/, view: views.questions, title: '勉強の質問' },
  { re: /^\/consultations\/new$/, view: views.consultationNew, title: '相談・通報の送信' },
  { re: /^\/consultations\/([^/]+)$/, view: views.consultationDetail, title: '相談', keys: ['id'] },
  { re: /^\/consultations$/, view: views.consultations, title: '相談' },
  { re: /^\/supplementary$/, view: views.supplementary, title: '補習予約' },
  { re: /^\/students\/([^/]+)$/, view: views.studentDetail, title: '生徒詳細', keys: ['id'] },
  { re: /^\/students$/, view: views.students, title: '生徒一覧' },
  { re: /^\/teachers\/([^/]+)$/, view: views.teacherDetail, title: '講師詳細', keys: ['id'] },
  { re: /^\/teachers$/, view: views.teachers, title: '講師一覧' },
  { re: /^\/notices$/, view: views.notices, title: 'お知らせ' },
  { re: /^\/account$/, view: views.account, title: 'アカウント設定' },
];

const MENU = [
  { label: 'ダッシュボード', hash: '#/', key: 'dashboard' },
  { label: '時間割', hash: '#/timetable', key: 'timetable', roles: ['student', 'guardian'] },
  { label: '補習予約', hash: '#/supplementary', key: 'supplementary', roles: ['student', 'guardian'] },
  { label: '補習枠', hash: '#/supplementary', key: 'supplementary', roles: ['teacher', 'classroom_admin', 'system_admin'] },
  { label: '入退室', hash: '#/checkins', key: 'checkins', roles: ['teacher', 'classroom_admin', 'system_admin'] },
  { label: '質問・相談', hash: '#/hub', key: 'hub', roles: ['student'] },
  { label: '質問対応', hash: '#/questions', key: 'questions', roles: ['teacher'] },
  { label: '質問管理', hash: '#/questions', key: 'questions', roles: ['classroom_admin', 'system_admin'] },
  { label: 'メッセージ', hash: '#/messages', key: 'messages' },
  { label: '授業記録', hash: '#/records', key: 'records' },
  { label: '生徒', hash: '#/students', key: 'students', roles: ['teacher', 'classroom_admin', 'system_admin'] },
  { label: '講師', hash: '#/teachers', key: 'teachers', roles: ['classroom_admin', 'system_admin'] },
  { label: 'お知らせ', hash: '#/notices', key: 'notices' },
  { label: '相談・通報', hash: '#/consultations', key: 'consultations', roles: ['guardian', 'teacher'] },
  { label: '相談管理', hash: '#/consultations', key: 'consultations', roles: ['classroom_admin', 'system_admin'] },
  { label: '設定', hash: '#/account', key: 'account' },
];

function menuForRole(role) { return MENU.filter((m) => !m.roles || m.roles.includes(role)); }

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => (query[k] = v));
  return { path: path || '/', query };
}

function activeKey(path) {
  if (path === '/' || path === '') return 'dashboard';
  return path.split('/')[1] || 'dashboard';
}

// ------------------------------------------------------------------
// ログイン画面
// ------------------------------------------------------------------
async function renderLogin() {
  const info = SCOPE_INFO[SCOPE];
  let demo = { accounts: [], password: '' };
  try { demo = await api.demoAccounts(SCOPE); } catch (e) { /* 起動直後など */ }
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand">${h(info.title)}<span>${h(info.sub)}</span></div>
        <div id="login-err" class="form-error" hidden style="margin-top:16px"></div>
        <form id="login-form">
          <div class="field" style="margin-top:16px"><label>ログインID</label><input name="loginId" autocomplete="username" required></div>
          <div class="field" style="margin-top:12px"><label>パスワード</label><input name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn primary" type="submit" style="margin-top:16px;width:100%">ログイン</button>
        </form>
        <div class="login-demo">
          <h4>体験用アカウント</h4>
          <p class="hint">試験運用向けの仮アカウントです。パスワードは <b>${h(demo.password)}</b>（共通）。押すと自動入力されます。</p>
          <div class="demo-btns">
            ${demo.accounts.map((a) => `<button class="btn sm" data-login="${h(a.loginId)}">${h(a.roleLabel)}：${h(a.name)}（ID: ${h(a.loginId)}）</button>`).join('')}
          </div>
        </div>
        <div style="margin-top:16px;text-align:center;font-size:12.5px"><a href="${h(info.other.href)}">${h(info.other.label)}</a></div>
      </div>
    </div>`;

  const form = root.querySelector('#login-form');
  const errBox = root.querySelector('#login-err');
  const submit = async (loginId, password) => {
    try { await api.login(loginId, password, SCOPE); await boot(); }
    catch (err) { errBox.textContent = err.message; errBox.hidden = false; }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(form); submit(String(v.get('loginId')).trim(), String(v.get('password'))); });
  root.querySelectorAll('[data-login]').forEach((b) => b.addEventListener('click', () => {
    form.loginId.value = b.getAttribute('data-login');
    form.password.value = demo.password;
    errBox.hidden = true;
  }));
}

// ------------------------------------------------------------------
// アプリ本体（ログイン後）
// ------------------------------------------------------------------
function renderApp() {
  const u = state.user;
  const menu = menuForRole(u.role);
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="logo">LuBo School<small>飯能教室</small></div>
        <nav id="side-nav">
          ${menu.map((m) => `<a href="${m.hash}" data-key="${m.key}"><span class="ic">${ICONS[m.key] || ''}</span><span class="lb">${h(m.label)}</span></a>`).join('')}
        </nav>
        <div class="side-foot">${h(u.name)}<br><span class="muted">${h(u.roleLabel)}</span></div>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1 id="page-title">ダッシュボード</h1>
          <div class="who">
            <a class="btn sm notif-btn" id="notif-btn" href="#/notifications">通知<span id="notif-count" class="notif-count" hidden>0</span></a>
            <span class="role-chip">${h(u.roleLabel)}</span>
            <span class="uname">${h(u.name)}</span>
            <button class="btn sm" id="top-logout">ログアウト</button>
          </div>
        </div>
        <div class="content" id="content"></div>
      </div>
      <nav class="bottom-nav" id="bottom-nav">
        ${menu.map((m) => `<a href="${m.hash}" data-key="${m.key}"><span class="ic">${ICONS[m.key] || ''}</span><span class="lb">${h(m.label)}</span></a>`).join('')}
      </nav>
    </div>`;

  root.querySelector('#top-logout').addEventListener('click', async () => { await api.logout(); location.hash = ''; location.reload(); });
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
  refreshNotif();
}

async function refreshNotif() {
  try {
    const { unread } = await api.get('/api/notifications');
    const el = document.getElementById('notif-count');
    if (!el) return;
    if (unread > 0) { el.textContent = unread > 99 ? '99+' : String(unread); el.hidden = false; }
    else el.hidden = true;
  } catch (e) { /* 未ログイン等は無視 */ }
}

async function renderRoute() {
  if (!state.user) return;
  const { path, query } = parseHash();
  const content = document.getElementById('content');
  if (!content) return;

  // ナビの選択状態
  const key = activeKey(path);
  // 質問・相談の配下は、生徒のハブ入口メニューをハイライトする
  const keys = [key];
  if (key === 'questions' || key === 'consultations') keys.push('hub');
  document.querySelectorAll('#side-nav a, #bottom-nav a').forEach((a) => {
    a.classList.toggle('active', keys.includes(a.getAttribute('data-key')));
  });

  const match = routes.find((r) => r.re.test(path));
  const titleEl = document.getElementById('page-title');
  if (!match) { titleEl.textContent = 'ページが見つかりません'; content.innerHTML = '<div class="empty">ページが見つかりません。</div>'; return; }

  const m = path.match(match.re);
  const params = {};
  if (match.keys) match.keys.forEach((k, i) => (params[k] = m[i + 1]));
  titleEl.textContent = match.title;
  content.innerHTML = '<div class="empty">読み込み中…</div>';

  try {
    const ctx = { user: state.user, params, query, reload: renderRoute };
    const res = await match.view(ctx);
    content.innerHTML = res.html;
    if (res.mount) res.mount(content, ctx);
    refreshNotif();
  } catch (err) {
    if (err.status === 401) { state.user = null; window.removeEventListener('hashchange', renderRoute); return renderLogin(); }
    content.innerHTML = `<div class="card"><div class="card-body"><div class="form-error" style="margin:0">${h(err.message || '表示できませんでした。')}</div></div></div>`;
  }
}

// ------------------------------------------------------------------
// 起動
// ------------------------------------------------------------------
async function boot() {
  if (!SCOPE) { location.replace('/'); return; }   // 区分未指定はポータルへ
  if (!getToken()) { renderLogin(); return; }       // 未ログイン（このタブに）
  try {
    const { user } = await api.me();
    state.user = user;
    if (!location.hash) location.hash = '#/';
    renderApp();
  } catch (e) {
    renderLogin();
  }
}

boot();
