'use strict';
/**
 * データの永続化。JSON ファイルへ保存し、起動時に読み込む。
 * 現場でまだ入力が無い間（userModified=false）は、当日を基準に日付を再配置して
 * ダッシュボードが常に埋まるようにする。実データが入り始めたら日付は動かさない。
 */
const fs = require('fs');
const path = require('path');
const { seed, demoSupplementary } = require('./seed');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

let data = null;
let saveTimer = null;

function todayStr(now) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function diffDays(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}
function shiftDate(str, days) {
  if (!str) return str;
  const datePart = str.slice(0, 10);
  const rest = str.slice(10);
  const d = new Date(datePart);
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${rest}`;
}

// 未入力状態のダミーデータの日付を当日基準へ寄せ直す
function reanchor(d, now) {
  const today = todayStr(now);
  const delta = diffDays(today, d.meta.anchor);
  if (delta === 0) return;
  d.lessons.forEach((l) => { l.date = shiftDate(l.date, delta); l.status = l.date < today ? '終了' : '予定'; });
  d.lessonRecords.forEach((r) => {
    r.date = shiftDate(r.date, delta);
    r.createdAt = shiftDate(r.createdAt, delta);
    if (r.confirmedByStudentAt) r.confirmedByStudentAt = shiftDate(r.confirmedByStudentAt, delta);
    if (r.confirmedByGuardianAt) r.confirmedByGuardianAt = shiftDate(r.confirmedByGuardianAt, delta);
  });
  d.notices.forEach((n) => { n.createdAt = shiftDate(n.createdAt, delta); });
  (d.attendanceEvents || []).forEach((a) => {
    a.date = shiftDate(a.date, delta);
    if (a.checkInAt) a.checkInAt = shiftDate(a.checkInAt, delta);
    if (a.checkOutAt) a.checkOutAt = shiftDate(a.checkOutAt, delta);
  });
  (d.notifications || []).forEach((n) => { if (n.createdAt) n.createdAt = shiftDate(n.createdAt, delta); });
  (d.consultations || []).forEach((c) => {
    if (c.createdAt) c.createdAt = shiftDate(c.createdAt, delta);
    (c.responses || []).forEach((r) => { if (r.at) r.at = shiftDate(r.at, delta); });
  });
  (d.messageThreads || []).forEach((t) => {
    if (t.createdAt) t.createdAt = shiftDate(t.createdAt, delta);
    if (t.lastMessageAt) t.lastMessageAt = shiftDate(t.lastMessageAt, delta);
    if (t.reads) Object.keys(t.reads).forEach((k) => { t.reads[k] = shiftDate(t.reads[k], delta); });
  });
  (d.messages || []).forEach((m) => {
    if (m.createdAt) m.createdAt = shiftDate(m.createdAt, delta);
    if (m.deletedAt) m.deletedAt = shiftDate(m.deletedAt, delta);
  });
  (d.studyQuestions || []).forEach((q) => {
    if (q.createdAt) q.createdAt = shiftDate(q.createdAt, delta);
    if (q.updatedAt) q.updatedAt = shiftDate(q.updatedAt, delta);
    if (q.dueAt) q.dueAt = shiftDate(q.dueAt, delta);
    if (q.reads) Object.keys(q.reads).forEach((k) => { q.reads[k] = shiftDate(q.reads[k], delta); });
  });
  (d.studyQuestionMessages || []).forEach((m) => {
    if (m.createdAt) m.createdAt = shiftDate(m.createdAt, delta);
    if (m.deletedAt) m.deletedAt = shiftDate(m.deletedAt, delta);
  });
  d.meta.anchor = today;
}

function load(now) {
  now = now || new Date();
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // 旧データにも新コレクションを保証する
      data.supplementarySlots = data.supplementarySlots || [];
      data.supplementaryBookings = data.supplementaryBookings || [];
      if (!data.meta || data.meta.userModified === false) reanchor(data, now);
      // 補習枠は、実際の枠登録／予約が行われる（supplementaryTouched）まで
      // 起動ごとに当日基準のデモを作り直す。以降は現場データとして凍結する。
      if (!data.meta || !data.meta.supplementaryTouched) demoSupplementary(data, now);
      return data;
    }
  } catch (e) {
    // 破損時は作り直す（内容はログに出さない）
    console.error('データ読込に失敗したため初期化します:', e.message);
  }
  data = seed(now);
  save();
  return data;
}

function save() {
  if (!data) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('データ保存に失敗:', e.message);
  }
}

// 連続書き込みをまとめる
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 150);
}

function markModified() {
  if (data && data.meta) data.meta.userModified = true;
}

function reset(now) {
  data = seed(now || new Date());
  save();
  return data;
}

function db() { return data; }

module.exports = { load, save, saveSoon, markModified, reset, db };
