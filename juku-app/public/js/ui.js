// 表示用の小さなヘルパ群。

export function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function fmtDate(str) {
  if (!str) return '';
  const d = str.slice(0, 10).split('-');
  if (d.length !== 3) return h(str);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(str.slice(0, 10)).getDay()];
  return `${Number(d[1])}/${Number(d[2])}（${wd}）`;
}

export function fmtDateTime(str) {
  if (!str) return '';
  return `${fmtDate(str)} ${str.slice(11, 16)}`.trim();
}

export function periodLabel(p) { return `${p}限`; }

export function attendanceBadge(a) {
  const map = { '出席': 'ok', '欠席': 'danger', '遅刻': 'warn', '早退': 'warn', '振替': 'info' };
  return `<span class="badge ${map[a] || 'neutral'}">${h(a)}</span>`;
}

export function confirmBadge(status) {
  if (status === '確認済み') return '<span class="badge ok">確認済み</span>';
  if (status === '未確認') return '<span class="badge warn">未確認</span>';
  return '<span class="badge neutral">—</span>';
}

let toastTimer = null;
export function toast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast' + (isError ? ' err' : '');
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// フォーム値の取得
export function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
  return out;
}

export function options(list, selected, valueKey, labelFn) {
  return list.map((it) => {
    const val = valueKey ? it[valueKey] : it;
    const label = labelFn ? labelFn(it) : val;
    return `<option value="${h(val)}"${String(val) === String(selected) ? ' selected' : ''}>${h(label)}</option>`;
  }).join('');
}
