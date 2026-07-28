'use strict';
/**
 * LuBo School - 塾運営支援システム（サーバー）
 * Node 標準モジュールのみ。ログイン・セッション・権限別の認可付き API を提供する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const auth = require('./lib/auth');
const store = require('./lib/store');
const audit = require('./lib/audit');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

store.load(new Date());

const ROLE_LABEL = {
  student: '生徒', guardian: '保護者', teacher: '講師',
  classroom_admin: '教室管理者', system_admin: 'システム管理者',
};
// アプリ区分ごとに利用できる役割（生徒・保護者用 / 講師・管理者用）
const SCOPE_ROLES = {
  family: ['student', 'guardian'],
  staff: ['teacher', 'classroom_admin', 'system_admin'],
};
function roleInScope(role, scope) { return SCOPE_ROLES[scope] ? SCOPE_ROLES[scope].includes(role) : true; }
const ATTENDANCE = ['出席', '欠席', '遅刻', '早退', '振替'];
const PERIODS = { 1: ['16:00', '17:20'], 2: ['17:30', '18:50'], 3: ['19:00', '20:20'], 4: ['20:30', '21:50'] };

// 相談・通報
const CONSULT_CATEGORIES = ['授業について', '人間関係', '講師について', '生徒について', 'ハラスメント', '贔屓や不公平', '体調・安全', 'その他'];
const CONSULT_URGENCY = ['低', '中', '高'];
const CONSULT_STATUS = ['未確認', '確認中', '対応中', '解決', '保留'];
// 勉強の質問
const QUESTION_STATUS = ['回答待ち', '講師確認中', '回答あり', '追加確認中', '解決済み'];

// 指導報告の定型文（入力時間の短縮用）。科目別＋共通。
const REPORT_TEMPLATES = {
  progress: {
    '数学': ['一次関数のグラフを扱いました。', '因数分解の演習を行いました。', '文章題の立式を練習しました。'],
    '英語': ['現在完了の用法を確認しました。', '長文読解の精読を行いました。', '不規則動詞の小テストを実施しました。'],
    '国語': ['説明文の要旨把握を練習しました。', '古文単語の確認を行いました。', '記述問題の型を練習しました。'],
    '理科': ['化学変化と質量の関係を扱いました。', '電流と回路の演習を行いました。'],
    '社会': ['歴史の重要語句を確認しました。', '地理のグラフ読み取りを練習しました。'],
    '_common': ['前回の復習を行いました。', '単元テストを実施しました。', '基礎の確認から応用へ進みました。'],
  },
  homework: { '_common': ['ワーク p.○○〜p.○○', 'プリント1枚', '単語テストの範囲を暗記', '間違い直しを提出'] },
  comment: { '_common': ['集中して取り組めていました。', '前回より理解が進んでいます。', '宿題の提出をお願いします。', '基礎は定着してきています。'] },
};

// ------------------------------------------------------------------
// HTTP ヘルパ
// ------------------------------------------------------------------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function sendErr(res, status, message) { sendJson(res, status, { error: message }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 6_000_000) { reject(new Error('too large')); req.destroy(); return; }
      body += c;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------------
// 認証・利用者解決
// ------------------------------------------------------------------
function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers['authorization'] || '');
  return m ? m[1] : null;
}
// セッションは Cookie ではなくトークン（Authorization ヘッダ）で識別する。
// これによりタブ／ウィンドウごとに独立したログインになり、区分間でセッションが混ざらない。
function currentUser(req) {
  const sess = auth.getSession(bearerToken(req));
  if (!sess) return null;
  const d = store.db();
  return d.users.find((u) => u.id === sess.userId) || null;
}
function isAdmin(u) { return u && (u.role === 'classroom_admin' || u.role === 'system_admin'); }
function publicUser(u) {
  return { id: u.id, loginId: u.loginId, role: u.role, roleLabel: ROLE_LABEL[u.role], name: u.name, linkedId: u.linkedId, classroomId: u.classroomId };
}

// ------------------------------------------------------------------
// 参照ヘルパ・シリアライザ
// ------------------------------------------------------------------
function nameMaps() {
  const d = store.db();
  const t = {}; d.teachers.forEach((x) => (t[x.id] = x.name));
  const s = {}; d.students.forEach((x) => (s[x.id] = x));
  const r = {}; d.classrooms.forEach((c) => c.rooms.forEach((rm) => (r[rm.id] = rm.name)));
  return { teacher: t, student: s, room: r };
}

function lessonOut(l, maps) {
  return {
    id: l.id, date: l.date, period: l.period, start: l.start, end: l.end, subject: l.subject,
    teacherId: l.teacherId, teacherName: maps.teacher[l.teacherId] || '—',
    roomId: l.roomId, roomName: maps.room[l.roomId] || '—',
    studentIds: l.studentIds, studentNames: l.studentIds.map((id) => (maps.student[id] || {}).name || '—'),
    type: l.type, status: l.status,
  };
}

function recordOut(r, maps) {
  const stu = maps.student[r.studentId] || {};
  let confirm = '—';
  if (r.sharedWithStudent || r.sharedWithGuardian) {
    if (r.confirmedByStudentAt || r.confirmedByGuardianAt) confirm = '確認済み';
    else confirm = '未確認';
  }
  return {
    id: r.id, date: r.date, period: r.period, subject: r.subject, attendance: r.attendance,
    studentId: r.studentId, studentName: stu.name || '—', studentGrade: stu.grade || '',
    teacherId: r.teacherId, teacherName: maps.teacher[r.teacherId] || '—',
    progress: r.progress, homework: r.homework, checkNext: r.checkNext, comment: r.comment,
    nextPlan: r.nextPlan, attachments: r.attachments || [],
    sharedWithStudent: r.sharedWithStudent, sharedWithGuardian: r.sharedWithGuardian,
    confirmedByStudentAt: r.confirmedByStudentAt, confirmedByGuardianAt: r.confirmedByGuardianAt,
    confirmStatus: confirm, createdAt: r.createdAt,
  };
}

// ------------------------------------------------------------------
// 認可スコープ
// ------------------------------------------------------------------
function guardianOf(user) {
  const d = store.db();
  return d.guardians.find((g) => g.id === user.linkedId);
}
function studentIdsFor(user) {
  if (user.role === 'student') return [user.linkedId];
  if (user.role === 'guardian') { const g = guardianOf(user); return g ? g.studentIds : []; }
  return [];
}
function canViewStudent(user, studentId) {
  const d = store.db();
  const stu = d.students.find((s) => s.id === studentId);
  if (!stu) return false;
  if (user.role === 'system_admin') return true;
  if (user.role === 'classroom_admin') return stu.classroomId === user.classroomId;
  if (user.role === 'teacher') return stu.classroomId === user.classroomId;
  if (user.role === 'student') return stu.id === user.linkedId;
  if (user.role === 'guardian') return studentIdsFor(user).includes(stu.id);
  return false;
}
function visibleRecords(user) {
  const d = store.db();
  if (user.role === 'system_admin') return d.lessonRecords.slice();
  if (user.role === 'classroom_admin') {
    const ids = new Set(d.students.filter((s) => s.classroomId === user.classroomId).map((s) => s.id));
    return d.lessonRecords.filter((r) => ids.has(r.studentId));
  }
  if (user.role === 'teacher') return d.lessonRecords.filter((r) => r.teacherId === user.linkedId);
  const mine = new Set(studentIdsFor(user));
  return d.lessonRecords.filter((r) => mine.has(r.studentId));
}

// 生徒詳細の項目を閲覧者に応じて出し分ける（機密＝careNote は管理者のみ）
function studentDetailOut(stu, user, maps) {
  const d = store.db();
  const base = {
    id: stu.id, name: stu.name, grade: stu.grade, subjects: stu.subjects,
    classroomId: stu.classroomId, status: stu.status,
  };
  if (isAdmin(user) || user.role === 'teacher') base.barcode = stu.barcode || '';
  if (isAdmin(user)) {
    base.careNote = stu.careNote || '';
    base.guardians = stu.guardianIds.map((gid) => {
      const g = d.guardians.find((x) => x.id === gid) || {};
      return { id: g.id, name: g.name, relation: g.relation, phone: g.phone, email: g.email };
    });
  } else if (user.role === 'guardian') {
    const g = guardianOf(user);
    if (g) base.guardians = [{ id: g.id, name: g.name, relation: g.relation, phone: g.phone, email: g.email }];
  }
  return base;
}

// ------------------------------------------------------------------
// 入退室・通知ヘルパ
// ------------------------------------------------------------------
function checkinStatus(ev) {
  if (!ev || !ev.checkInAt) return '未入室';
  if (ev.checkOutAt) return '退室済';
  return '在室中';
}
function findEvent(studentId, date) {
  const d = store.db();
  return d.attendanceEvents.find((e) => e.studentId === studentId && e.date === date);
}
function pushNotification(userId, type, refId, text) {
  const d = store.db();
  d.notifications.push({ id: crypto.randomUUID(), userId, type, refId, text, read: false, createdAt: new Date().toISOString() });
}
function notifyGuardiansAndStudent(studentId, type, refId, text) {
  const d = store.db();
  const stu = d.students.find((s) => s.id === studentId);
  const su = d.users.find((u) => u.role === 'student' && u.linkedId === studentId);
  if (su) pushNotification(su.id, type, refId, text);
  (stu ? stu.guardianIds : []).forEach((gid) => {
    const gu = d.users.find((u) => u.role === 'guardian' && u.linkedId === gid);
    if (gu) pushNotification(gu.id, type, refId, text);
  });
}
function visibleNotices(user) {
  const d = store.db();
  const aud = { student: 'students', guardian: 'students', teacher: 'teachers' }[user.role];
  let list = d.notices.filter((n) => n.audience === 'all' || (aud && n.audience === aud) || isAdmin(user));
  if (user.role === 'classroom_admin') list = list.filter((n) => n.classroomId === user.classroomId);
  return list;
}
function unreadNoticeCount(user) {
  return visibleNotices(user).filter((n) => !(n.readBy || []).includes(user.id)).length;
}

// ------------------------------------------------------------------
// バリデーション
// ------------------------------------------------------------------
function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 2000) : ''; }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------
// API ハンドラ
// ------------------------------------------------------------------
const api = {};

// --- 認証 ---
api['POST /api/session'] = async (req, res) => {
  const b = await readBody(req);
  const loginId = str(b.loginId, 60).trim();
  const password = str(b.password, 200);
  const scope = str(b.scope, 20);
  if (!loginId || !password) return sendErr(res, 400, 'IDとパスワードを入力してください。');
  const d = store.db();
  const user = d.users.find((u) => u.loginId === loginId);
  if (!user || !auth.verifyPassword(password, user.salt, user.hash)) {
    return sendErr(res, 401, 'IDまたはパスワードが正しくありません。');
  }
  // 区分（生徒・保護者用 / 講師・管理者用）に合わない役割のログインは拒否する
  if (scope && !roleInScope(user.role, scope)) {
    return sendErr(res, 403, scope === 'staff'
      ? 'この画面は講師・管理者用です。生徒・保護者の方は「生徒・保護者用」からログインしてください。'
      : 'この画面は生徒・保護者用です。講師・管理者の方は「講師・スタッフ用」からログインしてください。');
  }
  const token = auth.createSession(user.id);
  audit.record(user, 'login', 'user', user.id, { scope: scope || null });
  sendJson(res, 200, { token, user: publicUser(user) });
};
api['GET /api/session'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  sendJson(res, 200, { user: publicUser(user) });
};
api['DELETE /api/session'] = async (req, res, user) => {
  auth.destroySession(bearerToken(req));
  sendJson(res, 200, { ok: true });
};

// --- ログイン画面向けの体験用アカウント一覧（区分ごとに出し分け）---
api['GET /api/demo-accounts'] = async (req, res, user, url) => {
  const d = store.db();
  const scope = url.searchParams.get('scope');
  const byLogin = (id) => d.users.find((u) => u.loginId === id);
  const pick = (id) => { const u = byLogin(id); return u ? { loginId: u.loginId, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role] } : null; };
  const ids = scope === 'family' ? ['s01', 'g01'] : scope === 'staff' ? ['t01', 'kanri', 'admin'] : ['s01', 'g01', 't01', 'kanri', 'admin'];
  sendJson(res, 200, { password: require('./lib/seed').DEMO_PASSWORD, accounts: ids.map(pick).filter(Boolean) });
};

// --- ダッシュボード ---
api['GET /api/dashboard'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const maps = nameMaps();
  const today = todayStr();

  if (user.role === 'teacher') {
    const tid = user.linkedId;
    const myLessons = d.lessons.filter((l) => l.teacherId === tid);
    const todayLessons = myLessons.filter((l) => l.date === today).sort((a, b) => a.period - b.period);
    const todayStudentIds = [...new Set(todayLessons.flatMap((l) => l.studentIds))];
    // 未入力の授業記録: 過去〜当日で、記録が無い(生徒×コマ)
    const recSet = new Set(d.lessonRecords.map((r) => r.lessonId + '|' + r.studentId));
    const unrecorded = [];
    myLessons.filter((l) => l.date <= today).forEach((l) => {
      l.studentIds.forEach((sid) => { if (!recSet.has(l.id + '|' + sid)) unrecorded.push({ lesson: lessonOut(l, maps), studentName: (maps.student[sid] || {}).name }); });
    });
    const absent = visibleRecords(user).filter((r) => r.attendance === '欠席').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map((r) => recordOut(r, maps));
    const notices = visibleNotices(user).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((n) => ({ ...n, read: (n.readBy || []).includes(user.id) }));
    const presentNow = d.attendanceEvents.filter((e) => e.date === today && e.checkInAt && !e.checkOutAt && todayStudentIds.includes(e.studentId)).length;
    return sendJson(res, 200, {
      role: 'teacher',
      todayLessons: todayLessons.map((l) => lessonOut(l, maps)),
      todayStudents: todayStudentIds.map((id) => ({ id, name: (maps.student[id] || {}).name, grade: (maps.student[id] || {}).grade })),
      unrecorded: unrecorded.slice(0, 12), unrecordedCount: unrecorded.length,
      absent, notices,
      presentNow, todayStudentCount: todayStudentIds.length,
      unreadNotices: unreadNoticeCount(user),
      pending: { unreadMessages: unreadMessagesTotal(user), supplementary: upcomingSupplementaryCount(user) },
    });
  }

  if (user.role === 'student' || user.role === 'guardian') {
    const sids = studentIdsFor(user);
    const upcoming = d.lessons.filter((l) => l.date >= today && l.studentIds.some((s) => sids.includes(s)))
      .sort((a, b) => (a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1)));
    const myRecords = visibleRecords(user).sort((a, b) => (a.date < b.date ? 1 : -1));
    const homework = myRecords.filter((r) => r.homework).slice(0, 8).map((r) => recordOut(r, maps));
    const absentRecords = myRecords.filter((r) => r.attendance === '欠席').map((r) => recordOut(r, maps));
    const notices = visibleNotices(user).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((n) => ({ ...n, read: (n.readBy || []).includes(user.id) }));
    const checkins = sids.map((id) => { const ev = findEvent(id, today); const stu = maps.student[id] || {}; return { id, name: stu.name, grade: stu.grade, status: checkinStatus(ev), checkInAt: ev ? ev.checkInAt : null, checkOutAt: ev ? ev.checkOutAt : null }; });
    return sendJson(res, 200, {
      role: user.role,
      children: sids.map((id) => ({ id, name: (maps.student[id] || {}).name, grade: (maps.student[id] || {}).grade })),
      checkins,
      nextLesson: upcoming[0] ? lessonOut(upcoming[0], maps) : null,
      upcoming: upcoming.slice(0, 5).map((l) => lessonOut(l, maps)),
      homework, absentRecords, notices,
      unreadNotices: unreadNoticeCount(user),
      pending: { unreadMessages: unreadMessagesTotal(user), supplementary: upcomingSupplementaryCount(user) },
    });
  }

  // 管理者
  const scopeStudents = user.role === 'system_admin' ? d.students : d.students.filter((s) => s.classroomId === user.classroomId);
  const scopeStudentIds = new Set(scopeStudents.map((s) => s.id));
  const todayLessons = d.lessons.filter((l) => l.date === today && (user.role === 'system_admin' || l.classroomId === user.classroomId));
  const expected = new Set(todayLessons.flatMap((l) => l.studentIds)).size;
  const workingTeachers = [...new Set(todayLessons.map((l) => l.teacherId))];
  const absentToday = d.lessonRecords.filter((r) => r.date === today && r.attendance === '欠席' && scopeStudentIds.has(r.studentId)).length;
  // 講師ごとの担当数（当日〜7日）
  const from = today; const to = (() => { const dt = new Date(today); dt.setDate(dt.getDate() + 7); return dt.toISOString().slice(0, 10); })();
  const load = d.teachers.filter((t) => user.role === 'system_admin' || t.classroomId === user.classroomId).map((t) => {
    const cnt = d.lessons.filter((l) => l.teacherId === t.id && l.date >= from && l.date <= to).length;
    return { id: t.id, name: t.name, count: cnt };
  });
  const avg = load.length ? load.reduce((a, b) => a + b.count, 0) / load.length : 0;
  load.forEach((x) => { x.over = avg > 0 && x.count >= avg * 1.5; });
  load.sort((a, b) => b.count - a.count);
  const notices = visibleNotices(user).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((n) => ({ ...n, read: (n.readBy || []).includes(user.id) }));
  const presentEvents = d.attendanceEvents.filter((e) => e.date === today && e.checkInAt && !e.checkOutAt && scopeStudentIds.has(e.studentId));
  const presentList = presentEvents.map((e) => ({ id: e.studentId, name: (maps.student[e.studentId] || {}).name, checkInAt: e.checkInAt }));
  const openConsultations = d.consultations.filter((c) => (user.role === 'system_admin' || c.classroomId === user.classroomId) && c.status !== '解決').length;
  const unconfirmedConsultations = d.consultations.filter((c) => (user.role === 'system_admin' || c.classroomId === user.classroomId) && c.status === '未確認').length;
  sendJson(res, 200, {
    role: user.role,
    todayLessonCount: todayLessons.length,
    expected, absentToday,
    presentNow: presentEvents.length, presentList,
    workingTeachers: workingTeachers.map((id) => ({ id, name: maps.teacher[id] })),
    load, loadAvg: Math.round(avg * 10) / 10,
    notices,
    unreadNotices: unreadNoticeCount(user),
    openConsultations, unconfirmedConsultations,
    pending: { supplementary: upcomingSupplementaryCount(user), scheduleWarnings: null }, // フェーズ3〜4
  });
};

// --- 授業記録 ---
api['GET /api/lesson-records'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const maps = nameMaps();
  let list = visibleRecords(user);
  const q = url.searchParams;
  const fStudent = q.get('student'); const fSubject = q.get('subject'); const fTeacher = q.get('teacher');
  const fConfirm = q.get('confirm'); const fText = (q.get('q') || '').trim();
  if (fStudent) list = list.filter((r) => r.studentId === fStudent);
  if (fSubject) list = list.filter((r) => r.subject === fSubject);
  if (fTeacher) list = list.filter((r) => r.teacherId === fTeacher);
  if (fConfirm === '未確認') list = list.filter((r) => (r.sharedWithStudent || r.sharedWithGuardian) && !(r.confirmedByStudentAt || r.confirmedByGuardianAt));
  if (fConfirm === '確認済み') list = list.filter((r) => r.confirmedByStudentAt || r.confirmedByGuardianAt);
  if (fText) list = list.filter((r) => ((maps.student[r.studentId] || {}).name || '').includes(fText) || (r.subject || '').includes(fText));
  list = list.sort((a, b) => (a.date === b.date ? b.period - a.period : (a.date < b.date ? 1 : -1)));
  sendJson(res, 200, { records: list.slice(0, 300).map((r) => recordOut(r, maps)) });
};

api['GET /api/lesson-records/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const r = d.lessonRecords.find((x) => x.id === params.id);
  if (!r || !visibleRecords(user).some((x) => x.id === r.id)) return sendErr(res, 404, '記録が見つかりません。');
  sendJson(res, 200, { record: recordOut(r, nameMaps()) });
};

api['POST /api/lesson-records'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '授業記録を作成する権限がありません。');
  const b = await readBody(req);
  const d = store.db();
  const studentId = str(b.studentId, 40);
  if (!canViewStudent(user, studentId)) return sendErr(res, 400, '対象の生徒を選択してください。');
  const date = str(b.date, 10);
  if (!DATE_RE.test(date)) return sendErr(res, 400, '授業日を正しく入力してください。');
  const period = Number(b.period);
  if (!PERIODS[period]) return sendErr(res, 400, '授業時間を選択してください。');
  const subject = str(b.subject, 20);
  if (!d.subjects.includes(subject)) return sendErr(res, 400, '科目を選択してください。');
  const attendance = str(b.attendance, 10);
  if (!ATTENDANCE.includes(attendance)) return sendErr(res, 400, '出欠を選択してください。');
  let teacherId = user.role === 'teacher' ? user.linkedId : str(b.teacherId, 40);
  if (!d.teachers.some((t) => t.id === teacherId)) return sendErr(res, 400, '担当講師を選択してください。');
  const shared = attendance === '欠席';

  const rec = {
    id: 'rec-' + crypto.randomUUID().slice(0, 8),
    lessonId: str(b.lessonId, 40) || null, studentId, date, period, subject, teacherId, attendance,
    progress: str(b.progress, 4000), homework: str(b.homework, 2000), checkNext: str(b.checkNext, 2000),
    comment: str(b.comment, 2000), nextPlan: str(b.nextPlan, 2000),
    attachments: Array.isArray(b.attachments) ? b.attachments.slice(0, 10).map((a) => ({ label: str(a.label, 120) })).filter((a) => a.label) : [],
    sharedWithStudent: shared, sharedWithGuardian: shared,
    confirmedByStudentAt: null, confirmedByGuardianAt: null,
    createdBy: user.id, createdAt: new Date().toISOString(),
  };
  d.lessonRecords.push(rec);
  if (shared) {
    const stu = d.students.find((s) => s.id === studentId);
    const targets = [];
    const su = d.users.find((u) => u.role === 'student' && u.linkedId === studentId);
    if (su) targets.push(su.id);
    (stu ? stu.guardianIds : []).forEach((gid) => { const gu = d.users.find((u) => u.role === 'guardian' && u.linkedId === gid); if (gu) targets.push(gu.id); });
    targets.forEach((uid) => d.notifications.push({ id: crypto.randomUUID(), userId: uid, type: 'absence_record', refId: rec.id, text: `${date} ${subject} の欠席記録が共有されました。`, read: false, createdAt: new Date().toISOString() }));
  }
  store.markModified();
  store.saveSoon();
  audit.record(user, 'create_lesson_record', 'lesson_record', rec.id, { attendance, shared });
  sendJson(res, 201, { record: recordOut(rec, nameMaps()) });
};

api['POST /api/lesson-records/:id/confirm'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'student' && user.role !== 'guardian') return sendErr(res, 403, '確認できるのは生徒・保護者のみです。');
  const d = store.db();
  const r = d.lessonRecords.find((x) => x.id === params.id);
  if (!r || !studentIdsFor(user).includes(r.studentId)) return sendErr(res, 404, '記録が見つかりません。');
  const now = new Date().toISOString();
  if (user.role === 'student') r.confirmedByStudentAt = r.confirmedByStudentAt || now;
  else r.confirmedByGuardianAt = r.confirmedByGuardianAt || now;
  store.markModified();
  store.saveSoon();
  audit.record(user, 'confirm_lesson_record', 'lesson_record', r.id, null);
  sendJson(res, 200, { record: recordOut(r, nameMaps()) });
};

// --- 授業（コマ）---
api['GET /api/lessons'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const maps = nameMaps();
  const date = url.searchParams.get('date');
  let list = d.lessons.slice();
  if (user.role === 'teacher') list = list.filter((l) => l.teacherId === user.linkedId);
  else if (user.role === 'student' || user.role === 'guardian') { const sids = studentIdsFor(user); list = list.filter((l) => l.studentIds.some((s) => sids.includes(s))); }
  else if (user.role === 'classroom_admin') list = list.filter((l) => l.classroomId === user.classroomId);
  if (date) list = list.filter((l) => l.date === date);
  list.sort((a, b) => (a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1)));
  sendJson(res, 200, { lessons: list.slice(0, 400).map((l) => lessonOut(l, maps)) });
};

// --- 入退室（入退室管理）---
api['GET /api/checkins'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const maps = nameMaps();
  const date = url.searchParams.get('date') || todayStr();

  // 対象生徒を役割で決める
  let studentIds;
  if (user.role === 'student' || user.role === 'guardian') {
    studentIds = studentIdsFor(user);
  } else if (user.role === 'teacher' || isAdmin(user)) {
    // 当日に授業がある生徒（＝登塾予定）＋当日すでに入退室した生徒
    let lessons = d.lessons.filter((l) => l.date === date);
    if (user.role === 'teacher') lessons = lessons.filter((l) => l.teacherId === user.linkedId);
    else if (user.role === 'classroom_admin') lessons = lessons.filter((l) => l.classroomId === user.classroomId);
    const set = new Set(lessons.flatMap((l) => l.studentIds));
    // 管理者は当日入退室のあった生徒も一覧に含める（受付視点）。講師は自分の担当生徒のみ。
    if (isAdmin(user)) {
      d.attendanceEvents.filter((e) => e.date === date).forEach((e) => {
        const stu = maps.student[e.studentId];
        if (stu && (user.role === 'system_admin' || stu.classroomId === user.classroomId)) set.add(e.studentId);
      });
    }
    studentIds = [...set];
  } else {
    return sendErr(res, 403, '閲覧権限がありません。');
  }

  const list = studentIds.map((id) => {
    const ev = findEvent(id, date);
    const stu = maps.student[id] || {};
    return { studentId: id, name: stu.name || '—', grade: stu.grade || '', status: checkinStatus(ev), checkInAt: ev ? ev.checkInAt : null, checkOutAt: ev ? ev.checkOutAt : null };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
  const present = list.filter((x) => x.status === '在室中').length;
  sendJson(res, 200, { date, students: list, present });
};

api['POST /api/checkins'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '入退室を記録する権限がありません。');
  const b = await readBody(req);
  const studentId = str(b.studentId, 40);
  const action = str(b.action, 8);
  if (!canViewStudent(user, studentId)) return sendErr(res, 400, '対象の生徒を選択してください。');
  if (action !== 'in' && action !== 'out') return sendErr(res, 400, '操作が不正です。');
  const d = store.db();
  const date = todayStr();
  const now = new Date().toISOString();
  let ev = findEvent(studentId, date);
  if (!ev) { ev = { id: 'att-' + crypto.randomUUID().slice(0, 8), studentId, date, checkInAt: null, checkOutAt: null, byUserId: user.id }; d.attendanceEvents.push(ev); }
  const maps = nameMaps();
  const nm = (maps.student[studentId] || {}).name || '生徒';
  const hhmm = now.slice(11, 16);
  if (action === 'in') { ev.checkInAt = now; ev.checkOutAt = null; notifyGuardiansAndStudent(studentId, 'checkin', ev.id, `${nm} さんが ${hhmm} に入室しました。`); }
  else { if (!ev.checkInAt) ev.checkInAt = now; ev.checkOutAt = now; notifyGuardiansAndStudent(studentId, 'checkin', ev.id, `${nm} さんが ${hhmm} に退室しました。`); }
  ev.byUserId = user.id;
  store.markModified(); store.saveSoon();
  audit.record(user, 'checkin_' + action, 'student', studentId, null);
  sendJson(res, 200, { studentId, status: checkinStatus(ev), checkInAt: ev.checkInAt, checkOutAt: ev.checkOutAt });
};

// バーコードで入退室をトグル記録（1回目=入室、在室中の再スキャン=退室）
function studentByBarcode(user, code) {
  const d = store.db();
  const norm = String(code || '').trim().toUpperCase();
  if (!norm) return null;
  const stu = d.students.find((s) => (s.barcode || '').toUpperCase() === norm);
  if (!stu || !canViewStudent(user, stu.id)) return null;
  return stu;
}
api['POST /api/checkins/scan'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '入退室を記録する権限がありません。');
  const b = await readBody(req);
  const stu = studentByBarcode(user, str(b.code, 60));
  if (!stu) return sendErr(res, 404, '該当する生徒が見つかりません。バーコードをご確認ください。');
  const d = store.db();
  const date = todayStr();
  const now = new Date().toISOString();
  let ev = findEvent(stu.id, date);
  if (!ev) { ev = { id: 'att-' + crypto.randomUUID().slice(0, 8), studentId: stu.id, date, checkInAt: null, checkOutAt: null, byUserId: user.id }; d.attendanceEvents.push(ev); }
  const present = ev.checkInAt && !ev.checkOutAt;
  const action = present ? 'out' : 'in';
  const hhmm = now.slice(11, 16);
  if (action === 'in') { ev.checkInAt = now; ev.checkOutAt = null; notifyGuardiansAndStudent(stu.id, 'checkin', ev.id, `${stu.name} さんが ${hhmm} に入室しました。`); }
  else { ev.checkOutAt = now; notifyGuardiansAndStudent(stu.id, 'checkin', ev.id, `${stu.name} さんが ${hhmm} に退室しました。`); }
  ev.byUserId = user.id;
  store.markModified(); store.saveSoon();
  audit.record(user, 'checkin_' + action, 'student', stu.id, { via: 'barcode' });
  sendJson(res, 200, { studentId: stu.id, name: stu.name, grade: stu.grade, action, at: now, status: checkinStatus(ev) });
};

// --- 通知（お知らせ・共有・入退室の受信箱）---
api['GET /api/notifications'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const list = d.notifications.filter((n) => n.userId === user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100)
    .map((n) => {
      let href = '#/';
      if (n.type === 'absence_record') href = '#/records/' + n.refId;
      else if (n.type === 'consultation') href = '#/consultations/' + n.refId;
      else if (n.type === 'message' || n.type === 'message_report') href = '#/messages/' + n.refId;
      else if (n.type === 'question') href = '#/questions/' + n.refId;
      else if (n.type === 'supplementary') href = '#/supplementary';
      return { id: n.id, type: n.type, text: n.text, read: n.read, createdAt: n.createdAt, href };
    });
  const unread = list.filter((n) => !n.read).length;
  sendJson(res, 200, { notifications: list, unread });
};
api['POST /api/notifications/read'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const b = await readBody(req);
  const d = store.db();
  d.notifications.forEach((n) => { if (n.userId === user.id && (!b.id || n.id === b.id)) n.read = true; });
  store.saveSoon();
  sendJson(res, 200, { ok: true });
};

// --- 生徒 ---
api['GET /api/students'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  let list = d.students;
  if (user.role !== 'system_admin') list = list.filter((s) => s.classroomId === user.classroomId);
  sendJson(res, 200, { students: list.map((s) => ({ id: s.id, name: s.name, grade: s.grade, subjects: s.subjects, status: s.status, barcode: s.barcode || '' })) });
};
api['GET /api/students/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (!canViewStudent(user, params.id)) return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  const stu = d.students.find((s) => s.id === params.id);
  const maps = nameMaps();
  const records = visibleRecords(user).filter((r) => r.studentId === stu.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50).map((r) => recordOut(r, maps));
  if (isAdmin(user) || user.role === 'teacher') audit.record(user, 'view_student', 'student', stu.id, null);
  sendJson(res, 200, { student: studentDetailOut(stu, user, maps), records });
};

// --- 講師 ---
api['GET /api/teachers'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  let list = d.teachers;
  if (user.role !== 'system_admin') list = list.filter((t) => t.classroomId === user.classroomId);
  sendJson(res, 200, { teachers: list.map((t) => ({ id: t.id, name: t.name, subjects: t.subjects, grades: t.grades, employmentType: t.employmentType })) });
};
api['GET /api/teachers/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const t = d.teachers.find((x) => x.id === params.id);
  if (!t) return sendErr(res, 404, '見つかりません。');
  const canView = isAdmin(user) || (user.role === 'teacher' && user.linkedId === t.id);
  if (!canView) return sendErr(res, 403, '閲覧権限がありません。');
  const maps = nameMaps();
  const today = todayStr();
  const upcoming = d.lessons.filter((l) => l.teacherId === t.id && l.date >= today).sort((a, b) => (a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1))).slice(0, 10).map((l) => lessonOut(l, maps));
  sendJson(res, 200, { teacher: { id: t.id, name: t.name, subjects: t.subjects, grades: t.grades, employmentType: t.employmentType }, upcoming });
};

// --- お知らせ ---
api['GET /api/notices'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const list = visibleNotices(user).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((n) => ({ id: n.id, title: n.title, body: n.body, audience: n.audience, createdAt: n.createdAt, read: (n.readBy || []).includes(user.id) }));
  sendJson(res, 200, { notices: list, unread: list.filter((n) => !n.read).length });
};
api['POST /api/notices/:id/read'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const n = visibleNotices(user).find((x) => x.id === params.id);
  if (!n) return sendErr(res, 404, 'お知らせが見つかりません。');
  if (!n.readBy) n.readBy = [];
  if (!n.readBy.includes(user.id)) { n.readBy.push(user.id); store.saveSoon(); }
  sendJson(res, 200, { ok: true });
};

// --- 相談・通報 ---
function userNameById(id) { const d = store.db(); const u = d.users.find((x) => x.id === id); return u ? u.name : '—'; }
function adminUserIdsFor(classroomId) {
  const d = store.db();
  return d.users.filter((u) => u.role === 'system_admin' || (u.role === 'classroom_admin' && u.classroomId === classroomId)).map((u) => u.id);
}
function visibleConsultations(user) {
  const d = store.db();
  if (user.role === 'system_admin') return d.consultations.slice();
  if (user.role === 'classroom_admin') return d.consultations.filter((c) => c.classroomId === user.classroomId);
  return d.consultations.filter((c) => c.createdByUserId === user.id);
}
function canViewConsultation(user, c) {
  if (user.role === 'system_admin') return true;
  if (user.role === 'classroom_admin') return c.classroomId === user.classroomId;
  return c.createdByUserId === user.id;
}
function consultListOut(c, user) {
  const base = { id: c.id, createdAt: c.createdAt, category: c.category, urgency: c.urgency, status: c.status };
  if (isAdmin(user)) {
    base.submitter = c.anonymous ? '匿名' : `${userNameById(c.createdByUserId)}（${ROLE_LABEL[c.createdByRole]}）`;
    base.anonymous = c.anonymous;
    base.assignee = c.assigneeUserId ? userNameById(c.assigneeUserId) : null;
  }
  return base;
}
function consultDetailOut(c, user) {
  const base = {
    id: c.id, createdAt: c.createdAt, category: c.category, target: c.target, urgency: c.urgency,
    body: c.body, attachments: c.attachments || [], status: c.status, wantsReply: c.wantsReply, anonymous: c.anonymous,
    responses: (c.responses || []).map((r) => ({ at: r.at, by: isAdmin(user) ? userNameById(r.byUserId) : '教室', text: r.text, status: r.status || null })),
  };
  if (isAdmin(user)) {
    const d = store.db();
    base.submitter = c.anonymous ? '匿名' : `${userNameById(c.createdByUserId)}（${ROLE_LABEL[c.createdByRole]}）`;
    base.assigneeUserId = c.assigneeUserId || '';
    base.assignee = c.assigneeUserId ? userNameById(c.assigneeUserId) : null;
    base.staffOptions = d.users
      .filter((u) => ['teacher', 'classroom_admin', 'system_admin'].includes(u.role))
      .filter((u) => user.role === 'system_admin' || u.role === 'system_admin' || u.classroomId === user.classroomId)
      .map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_LABEL[u.role] }));
    base.statusOptions = CONSULT_STATUS;
  }
  return base;
}

api['POST /api/consultations'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const b = await readBody(req);
  const category = str(b.category, 20);
  if (!CONSULT_CATEGORIES.includes(category)) return sendErr(res, 400, '相談の種類を選択してください。');
  const urgency = str(b.urgency, 4);
  if (!CONSULT_URGENCY.includes(urgency)) return sendErr(res, 400, '緊急度を選択してください。');
  const body = str(b.body, 5000).trim();
  if (!body) return sendErr(res, 400, '相談内容を入力してください。');
  const d = store.db();
  const c = {
    id: 'con-' + crypto.randomUUID().slice(0, 8), classroomId: user.classroomId || 'cls-hanno',
    createdByUserId: user.id, createdByRole: user.role,
    anonymous: b.anonymous === true, wantsReply: b.wantsReply === true,
    category, target: str(b.target, 120), urgency, body,
    attachments: Array.isArray(b.attachments) ? b.attachments.slice(0, 10).map((a) => ({ label: str(a.label, 120) })).filter((a) => a.label) : [],
    status: '未確認', assigneeUserId: null, responses: [], createdAt: new Date().toISOString(),
  };
  d.consultations.push(c);
  adminUserIdsFor(c.classroomId).forEach((uid) => pushNotification(uid, 'consultation', c.id, `新しい相談が届きました（${category}・緊急度${urgency}）。`));
  store.markModified(); store.saveSoon();
  audit.record(user, 'create_consultation', 'consultation', c.id, { category, urgency });
  sendJson(res, 201, { id: c.id });
};
api['GET /api/consultations'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  let list = visibleConsultations(user);
  if (isAdmin(user)) {
    const q = url.searchParams;
    const st = q.get('status'), cat = q.get('category'), ur = q.get('urgency');
    if (st) list = list.filter((c) => c.status === st);
    if (cat) list = list.filter((c) => c.category === cat);
    if (ur) list = list.filter((c) => c.urgency === ur);
  }
  list = list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  sendJson(res, 200, { consultations: list.map((c) => consultListOut(c, user)), categories: CONSULT_CATEGORIES, urgency: CONSULT_URGENCY, statuses: CONSULT_STATUS, isAdmin: isAdmin(user) });
};
api['GET /api/consultations/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const c = d.consultations.find((x) => x.id === params.id);
  if (!c || !canViewConsultation(user, c)) return sendErr(res, 404, '相談が見つかりません。');
  if (isAdmin(user)) audit.record(user, 'view_consultation', 'consultation', c.id, null);
  sendJson(res, 200, { consultation: consultDetailOut(c, user) });
};
api['POST /api/consultations/:id/update'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (!isAdmin(user)) return sendErr(res, 403, '相談を管理する権限がありません。');
  const d = store.db();
  const c = d.consultations.find((x) => x.id === params.id);
  if (!c || !canViewConsultation(user, c)) return sendErr(res, 404, '相談が見つかりません。');
  const b = await readBody(req);
  const newStatus = str(b.status, 10);
  const assignee = str(b.assigneeUserId, 40);
  const responseText = str(b.response, 4000).trim();
  let changed = false;
  if (newStatus && CONSULT_STATUS.includes(newStatus) && newStatus !== c.status) { c.status = newStatus; changed = true; }
  if (assignee && d.users.some((u) => u.id === assignee) && assignee !== c.assigneeUserId) { c.assigneeUserId = assignee; changed = true; }
  if (responseText) { c.responses.push({ at: new Date().toISOString(), byUserId: user.id, text: responseText, status: c.status }); changed = true; }
  if (!changed) return sendErr(res, 400, '変更内容がありません。');
  if (c.createdByUserId && (c.wantsReply || responseText)) {
    pushNotification(c.createdByUserId, 'consultation', c.id, responseText ? '相談に返信がありました。' : `相談の対応状況が「${c.status}」に更新されました。`);
  }
  store.markModified(); store.saveSoon();
  audit.record(user, 'update_consultation', 'consultation', c.id, { status: c.status });
  sendJson(res, 200, { consultation: consultDetailOut(c, user) });
};

// --- アプリ内メッセージ ---
const MSG_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
function validateAttachments(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const a of arr.slice(0, 2)) {
    const dataUrl = typeof (a && a.dataUrl) === 'string' ? a.dataUrl : '';
    const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) continue;
    const mime = m[1];
    if (!MSG_MIMES.includes(mime)) throw new Error('unsupported');
    const bytes = Math.floor((m[2].length * 3) / 4);
    if (bytes > 1_500_000) throw new Error('too large file');
    out.push({ name: str(a.name, 120) || ('file.' + (mime.split('/')[1] || 'bin')), mime, dataUrl });
  }
  return out;
}
function usersInScope(user) {
  const d = store.db();
  return d.users.filter((u) => u.id !== user.id && (user.role === 'system_admin' || u.classroomId === user.classroomId));
}
function allowedContacts(user) {
  const all = usersInScope(user);
  if (isAdmin(user) || user.role === 'teacher') return all;
  // 生徒・保護者は講師・管理者のみに送信可（生徒同士の閉じた連絡を避ける）
  return all.filter((u) => ['teacher', 'classroom_admin', 'system_admin'].includes(u.role));
}
function allowedContactIds(user) { return new Set(allowedContacts(user).map((u) => u.id)); }
function messagesOf(threadId) { return store.db().messages.filter((m) => m.threadId === threadId); }
function threadsForUser(user) {
  const d = store.db();
  if (isAdmin(user)) return d.messageThreads.filter((t) => user.role === 'system_admin' || t.classroomId === user.classroomId);
  return d.messageThreads.filter((t) => t.participantUserIds.includes(user.id));
}
function isParticipant(user, t) { return t.participantUserIds.includes(user.id); }
function canViewThread(user, t) {
  if (isParticipant(user, t)) return true;
  if (user.role === 'system_admin') return true;
  if (user.role === 'classroom_admin') return t.classroomId === user.classroomId;
  return false;
}
function threadUnread(t, user) {
  const last = (t.reads && t.reads[user.id]) || '';
  return messagesOf(t.id).filter((m) => !m.deleted && m.senderUserId !== user.id && (!last || m.createdAt > last)).length;
}
function unreadMessagesTotal(user) {
  return threadsForUser(user).filter((t) => isParticipant(user, t)).reduce((a, t) => a + threadUnread(t, user), 0);
}
function threadTitle(t, user) {
  if (t.title) return t.title;
  const others = t.participantUserIds.filter((id) => id !== user.id).map(userNameById);
  return others.join('、') || '（自分のみ）';
}
function roleLabelOf(uid) { const u = store.db().users.find((x) => x.id === uid); return u ? ROLE_LABEL[u.role] : ''; }
function participantsOut(t) { return t.participantUserIds.map((id) => ({ id, name: userNameById(id), roleLabel: roleLabelOf(id) })); }
function threadListOut(t, user) {
  const msgs = messagesOf(t.id).filter((m) => !m.deleted).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const last = msgs[0];
  return {
    id: t.id, type: t.type, title: threadTitle(t, user), participants: participantsOut(t),
    lastMessage: last ? { text: last.body ? last.body.slice(0, 40) : (last.attachments && last.attachments.length ? '[添付ファイル]' : ''), at: last.createdAt, senderName: userNameById(last.senderUserId) } : null,
    lastAt: t.lastMessageAt || t.createdAt, unread: threadUnread(t, user), member: isParticipant(user, t),
  };
}
function messageOut(m, user, t) {
  const base = { id: m.id, senderUserId: m.senderUserId, senderName: userNameById(m.senderUserId), createdAt: m.createdAt, mine: m.senderUserId === user.id, deleted: !!m.deleted };
  if (m.deleted) { base.body = ''; base.attachments = []; return base; }
  base.body = m.body; base.attachments = m.attachments || [];
  base.reported = !!(m.reportedBy && m.reportedBy.length);
  if (base.mine && t) {
    const others = t.participantUserIds.filter((id) => id !== user.id);
    base.readByOthers = others.length > 0 && others.every((id) => t.reads && t.reads[id] && t.reads[id] >= m.createdAt);
  }
  return base;
}
function threadDetailOut(t, user) {
  const msgs = messagesOf(t.id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return {
    id: t.id, type: t.type, title: threadTitle(t, user), participants: participantsOut(t),
    member: isParticipant(user, t), isAdminView: !isParticipant(user, t) && isAdmin(user),
    messages: msgs.map((m) => messageOut(m, user, t)),
  };
}
function appendMessage(t, user, body, attachments) {
  const d = store.db();
  const now = new Date().toISOString();
  const msg = { id: 'msg-' + crypto.randomUUID().slice(0, 8), threadId: t.id, senderUserId: user.id, body: body || '', attachments: attachments || [], createdAt: now, deleted: false, readBy: [], reportedBy: [] };
  d.messages.push(msg);
  t.lastMessageAt = now;
  if (!t.reads) t.reads = {};
  t.reads[user.id] = now;
  t.participantUserIds.filter((id) => id !== user.id).forEach((id) => pushNotification(id, 'message', t.id, `${user.name} さんからメッセージが届きました。`));
  audit.record(user, 'send_message', 'thread', t.id, null);
  return msg;
}
function attErr(res) { return sendErr(res, 400, '添付は画像またはPDF（1件あたり約1.4MBまで・2件まで）にしてください。'); }

api['GET /api/message-contacts'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const order = { teacher: 0, classroom_admin: 1, system_admin: 2, guardian: 3, student: 4 };
  const list = allowedContacts(user).map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_LABEL[u.role], role: u.role }))
    .sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name, 'ja'));
  sendJson(res, 200, { contacts: list });
};
api['GET /api/threads'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const list = threadsForUser(user).map((t) => threadListOut(t, user)).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  sendJson(res, 200, { threads: list });
};
api['POST /api/threads'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const b = await readBody(req);
  const recips = Array.isArray(b.recipientUserIds) ? [...new Set(b.recipientUserIds.filter((x) => typeof x === 'string'))] : [];
  if (!recips.length) return sendErr(res, 400, '宛先を選択してください。');
  const allowed = allowedContactIds(user);
  for (const r of recips) { if (!allowed.has(r)) return sendErr(res, 403, '送信できない宛先が含まれています。'); }
  const body = str(b.body, 5000).trim();
  let attachments; try { attachments = validateAttachments(b.attachments); } catch (e) { return attErr(res); }
  if (!body && !attachments.length) return sendErr(res, 400, 'メッセージを入力してください。');
  const d = store.db();
  const parts = [...new Set([user.id, ...recips])];
  const type = parts.length > 2 ? 'group' : 'direct';
  let thread = null;
  if (type === 'direct') thread = d.messageThreads.find((t) => t.type === 'direct' && t.participantUserIds.length === 2 && t.participantUserIds.includes(parts[0]) && t.participantUserIds.includes(parts[1]));
  if (!thread) {
    thread = { id: 'thr-' + crypto.randomUUID().slice(0, 8), type, title: type === 'group' ? (str(b.title, 80) || 'グループ') : '', participantUserIds: parts, classroomId: user.classroomId || 'cls-hanno', createdByUserId: user.id, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(), reads: {} };
    d.messageThreads.push(thread);
  }
  const msg = appendMessage(thread, user, body, attachments);
  store.markModified(); store.saveSoon();
  sendJson(res, 201, { threadId: thread.id, messageId: msg.id });
};
api['GET /api/threads/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const t = d.messageThreads.find((x) => x.id === params.id);
  if (!t || !canViewThread(user, t)) return sendErr(res, 404, '会話が見つかりません。');
  if (!isParticipant(user, t) && isAdmin(user)) audit.record(user, 'view_thread', 'thread', t.id, null);
  sendJson(res, 200, { thread: threadDetailOut(t, user) });
};
api['POST /api/threads/:id/messages'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const t = d.messageThreads.find((x) => x.id === params.id);
  if (!t) return sendErr(res, 404, '会話が見つかりません。');
  if (!isParticipant(user, t)) return sendErr(res, 403, 'この会話に参加していません。');
  const b = await readBody(req);
  const body = str(b.body, 5000).trim();
  let attachments; try { attachments = validateAttachments(b.attachments); } catch (e) { return attErr(res); }
  if (!body && !attachments.length) return sendErr(res, 400, 'メッセージを入力してください。');
  const msg = appendMessage(t, user, body, attachments);
  store.markModified(); store.saveSoon();
  sendJson(res, 200, { message: messageOut(msg, user, t) });
};
api['POST /api/threads/:id/read'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const t = d.messageThreads.find((x) => x.id === params.id);
  if (!t || !isParticipant(user, t)) return sendErr(res, 404, '会話が見つかりません。');
  if (!t.reads) t.reads = {};
  t.reads[user.id] = new Date().toISOString();
  store.saveSoon();
  sendJson(res, 200, { ok: true });
};
api['POST /api/threads/:id/participants'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const t = d.messageThreads.find((x) => x.id === params.id);
  if (!t) return sendErr(res, 404, '会話が見つかりません。');
  if (!isParticipant(user, t) && !isAdmin(user)) return sendErr(res, 403, '権限がありません。');
  const b = await readBody(req);
  const addId = str(b.userId, 40);
  const target = d.users.find((u) => u.id === addId);
  if (!target) return sendErr(res, 404, '対象が見つかりません。');
  if (!isAdmin(user) && !allowedContactIds(user).has(addId)) return sendErr(res, 403, '追加できない相手です。');
  if (!t.participantUserIds.includes(addId)) {
    t.participantUserIds.push(addId);
    t.type = t.participantUserIds.length > 2 ? 'group' : 'direct';
    pushNotification(addId, 'message', t.id, '会話に追加されました。');
    audit.record(user, 'add_participant', 'thread', t.id, { added: addId });
    store.markModified(); store.saveSoon();
  }
  sendJson(res, 200, { thread: threadDetailOut(t, user) });
};
api['POST /api/messages/:id/delete'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const m = d.messages.find((x) => x.id === params.id);
  if (!m) return sendErr(res, 404, 'メッセージが見つかりません。');
  if (m.senderUserId !== user.id && !isAdmin(user)) return sendErr(res, 403, '削除する権限がありません。');
  // 完全削除はせず、削除済み表示にする（本文は監査のため保持）
  m.deleted = true; m.deletedAt = new Date().toISOString(); m.deletedByUserId = user.id;
  store.markModified(); store.saveSoon();
  audit.record(user, 'delete_message', 'message', m.id, null);
  sendJson(res, 200, { ok: true });
};
api['POST /api/messages/:id/report'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const b = await readBody(req);
  const d = store.db();
  const m = d.messages.find((x) => x.id === params.id);
  if (!m) return sendErr(res, 404, 'メッセージが見つかりません。');
  const t = d.messageThreads.find((x) => x.id === m.threadId);
  if (!t || !canViewThread(user, t)) return sendErr(res, 404, 'メッセージが見つかりません。');
  if (!m.reportedBy) m.reportedBy = [];
  m.reportedBy.push({ userId: user.id, at: new Date().toISOString(), reason: str(b.reason, 500) });
  adminUserIdsFor(t.classroomId).forEach((uid) => pushNotification(uid, 'message_report', t.id, 'メッセージが通報されました。内容をご確認ください。'));
  store.markModified(); store.saveSoon();
  audit.record(user, 'report_message', 'message', m.id, null);
  sendJson(res, 200, { ok: true });
};
api['POST /api/messages/:id/forward-consultation'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const m = d.messages.find((x) => x.id === params.id);
  if (!m) return sendErr(res, 404, 'メッセージが見つかりません。');
  const t = d.messageThreads.find((x) => x.id === m.threadId);
  if (!t || !canViewThread(user, t)) return sendErr(res, 404, 'メッセージが見つかりません。');
  const c = {
    id: 'con-' + crypto.randomUUID().slice(0, 8), classroomId: t.classroomId, createdByUserId: user.id, createdByRole: user.role,
    anonymous: false, wantsReply: true, category: 'その他', target: 'メッセージからの転送', urgency: '中',
    body: `[メッセージから転送]\n送信者: ${userNameById(m.senderUserId)}\n内容: ${m.body || '（本文なし）'}`,
    attachments: [], status: '未確認', assigneeUserId: null, responses: [], createdAt: new Date().toISOString(),
  };
  d.consultations.push(c);
  adminUserIdsFor(t.classroomId).forEach((uid) => pushNotification(uid, 'consultation', c.id, 'メッセージから相談・通報が転送されました。'));
  store.markModified(); store.saveSoon();
  audit.record(user, 'forward_consultation', 'consultation', c.id, { fromMessage: m.id });
  sendJson(res, 201, { consultationId: c.id });
};

// --- 勉強の質問 ---
function teacherOf(user) { return store.db().teachers.find((t) => t.id === user.linkedId); }
function teacherUserId(teacherId) { const u = store.db().users.find((x) => x.role === 'teacher' && x.linkedId === teacherId); return u ? u.id : null; }
function teacherNameById(tid) { const t = store.db().teachers.find((x) => x.id === tid); return t ? t.name : null; }
function studentGradeById(sid) { const s = store.db().students.find((x) => x.id === sid); return s ? s.grade : ''; }
function teacherMatches(teacher, q) { return teacher && (teacher.subjects || []).includes(q.subject) && (teacher.grades || []).includes(studentGradeById(q.studentId)); }
function isClaimable(q, teacher) { return q.routing === 'open' && !q.assignedTeacherId && teacherMatches(teacher, q); }
function canViewQuestion(user, q) {
  if (user.role === 'system_admin') return true;
  if (user.role === 'classroom_admin') return q.classroomId === user.classroomId;
  if (user.role === 'student') return q.studentUserId === user.id;
  if (user.role === 'guardian') { const g = guardianOf(user); return !!g && g.studentIds.includes(q.studentId); }
  if (user.role === 'teacher') { const t = teacherOf(user); return q.assignedTeacherId === user.linkedId || isClaimable(q, t); }
  return false;
}
function questionsForUser(user) {
  const d = store.db();
  if (user.role === 'system_admin') return d.studyQuestions.slice();
  if (user.role === 'classroom_admin') return d.studyQuestions.filter((q) => q.classroomId === user.classroomId);
  if (user.role === 'student') return d.studyQuestions.filter((q) => q.studentUserId === user.id);
  if (user.role === 'guardian') { const g = guardianOf(user); const set = new Set(g ? g.studentIds : []); return d.studyQuestions.filter((q) => set.has(q.studentId)); }
  if (user.role === 'teacher') { const t = teacherOf(user); return d.studyQuestions.filter((q) => q.assignedTeacherId === user.linkedId || isClaimable(q, t)); }
  return [];
}
function questionMessagesOf(qid) { return store.db().studyQuestionMessages.filter((m) => m.questionId === qid).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)); }
function qUnread(q, user) {
  const last = (q.reads && q.reads[user.id]) || '';
  return questionMessagesOf(q.id).filter((m) => !m.deleted && m.senderUserId !== user.id && (!last || m.createdAt > last)).length;
}
function questionListOut(q, user) {
  const out = { id: q.id, number: q.number, subject: q.subject, title: q.title || `（${q.subject}の質問）`, status: q.status, createdAt: q.createdAt, updatedAt: q.updatedAt, dueAt: q.dueAt || '', assignedTeacherName: q.assignedTeacherId ? teacherNameById(q.assignedTeacherId) : null, unread: qUnread(q, user), studentName: (store.db().students.find((s) => s.id === q.studentId) || {}).name };
  if (user.role === 'teacher') { const t = teacherOf(user); out.mine = q.assignedTeacherId === user.linkedId; out.claimable = isClaimable(q, t); }
  return out;
}
function questionDetailOut(q, user) {
  const s = store.db().students.find((x) => x.id === q.studentId) || {};
  const t = user.role === 'teacher' ? teacherOf(user) : null;
  const msgs = questionMessagesOf(q.id).map((m) => ({ id: m.id, senderName: userNameById(m.senderUserId), senderRole: m.senderRole, kind: m.kind, createdAt: m.createdAt, deleted: !!m.deleted, mine: m.senderUserId === user.id, body: m.deleted ? '' : m.body, attachments: m.deleted ? [] : (m.attachments || []) }));
  return {
    id: q.id, number: q.number, subject: q.subject, unit: q.unit, title: q.title, body: q.body,
    attempted: q.attempted, stuckPoint: q.stuckPoint, material: q.material, page: q.page, problemNo: q.problemNo,
    dueAt: q.dueAt || '', routing: q.routing, status: q.status, attachments: q.attachments || [],
    studentName: s.name, studentGrade: s.grade, assignedTeacherName: q.assignedTeacherId ? teacherNameById(q.assignedTeacherId) : null,
    createdAt: q.createdAt, updatedAt: q.updatedAt, messages: msgs,
    canAnswer: user.role === 'teacher' && q.assignedTeacherId === user.linkedId && q.status !== '解決済み',
    canClaim: user.role === 'teacher' && isClaimable(q, t),
    canFollowup: user.role === 'student' && q.studentUserId === user.id && q.status !== '解決済み',
    canResolve: user.role === 'student' && q.studentUserId === user.id && q.status !== '解決済み',
    isAdminView: isAdmin(user),
  };
}
function notifyQuestionTargets(q, text) {
  const d = store.db();
  if (q.assignedTeacherId) { const uid = teacherUserId(q.assignedTeacherId); if (uid) pushNotification(uid, 'question', q.id, text); return; }
  d.teachers.filter((t) => t.classroomId === q.classroomId && teacherMatches(t, q)).forEach((t) => { const uid = teacherUserId(t.id); if (uid) pushNotification(uid, 'question', q.id, text); });
}

api['GET /api/questions'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  let list = questionsForUser(user);
  const p = url.searchParams;
  const st = p.get('status'), sub = p.get('subject'), tea = p.get('teacher'), q = (p.get('q') || '').trim();
  if (st) list = list.filter((x) => x.status === st);
  if (sub) list = list.filter((x) => x.subject === sub);
  if (tea) list = list.filter((x) => x.assignedTeacherId === tea);
  if (q) list = list.filter((x) => (x.title || '').includes(q) || (x.body || '').includes(q));
  list = list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const d = store.db();
  const out = { questions: list.map((x) => questionListOut(x, user)), statuses: QUESTION_STATUS, subjects: d.subjects, role: user.role, isAdmin: isAdmin(user) };
  if (isAdmin(user)) out.teachers = d.teachers.filter((t) => user.role === 'system_admin' || t.classroomId === user.classroomId).map((t) => ({ id: t.id, name: t.name }));
  else if (user.role === 'student') out.teachers = d.teachers.filter((t) => t.classroomId === user.classroomId).map((t) => ({ id: t.id, name: t.name, subjects: t.subjects }));
  sendJson(res, 200, out);
};
api['GET /api/questions/:id'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const q = d.studyQuestions.find((x) => x.id === params.id);
  if (!q || !canViewQuestion(user, q)) return sendErr(res, 404, '質問が見つかりません。');
  if (!q.reads) q.reads = {};
  q.reads[user.id] = new Date().toISOString();
  store.saveSoon();
  if (isAdmin(user)) audit.record(user, 'view_question', 'study_question', q.id, null);
  sendJson(res, 200, { question: questionDetailOut(q, user) });
};
api['POST /api/questions'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'student') return sendErr(res, 403, '質問を投稿できるのは生徒のみです。');
  const b = await readBody(req);
  const d = store.db();
  const subject = str(b.subject, 20);
  if (!d.subjects.includes(subject)) return sendErr(res, 400, '教科を選択してください。');
  const body = str(b.body, 5000).trim();
  let attachments; try { attachments = validateAttachments(b.attachments); } catch (e) { return attErr(res); }
  if (!body && !attachments.length) return sendErr(res, 400, '質問内容（文章）または画像を入力してください。');
  const routing = b.routing === 'assigned' ? 'assigned' : 'open';
  let assignedTeacherId = null;
  if (routing === 'assigned') { const tid = str(b.assignedTeacherId, 40); if (tid && d.teachers.some((t) => t.id === tid)) assignedTeacherId = tid; }
  const now = new Date().toISOString();
  const q = {
    id: 'sq-' + crypto.randomUUID().slice(0, 8), number: 'Q-' + String(d.studyQuestions.length + 1).padStart(4, '0'),
    studentId: user.linkedId, studentUserId: user.id, classroomId: user.classroomId || 'cls-hanno',
    subject, unit: str(b.unit, 60), title: str(b.title, 120) || `${subject}の質問`, body,
    attempted: str(b.attempted, 2000), stuckPoint: str(b.stuckPoint, 2000), material: str(b.material, 120), page: str(b.page, 20), problemNo: str(b.problemNo, 20),
    dueAt: DATE_RE.test(str(b.dueAt, 10)) ? b.dueAt : '', routing, assignedTeacherId, status: '回答待ち', attachments,
    createdAt: now, updatedAt: now, reads: { [user.id]: now },
  };
  d.studyQuestions.push(q);
  notifyQuestionTargets(q, `新しい質問が届きました（${subject}）。`);
  store.markModified(); store.saveSoon();
  audit.record(user, 'create_question', 'study_question', q.id, { subject, routing });
  sendJson(res, 201, { id: q.id, number: q.number });
};
api['POST /api/questions/:id/claim'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher') return sendErr(res, 403, '担当できるのは講師のみです。');
  const d = store.db();
  const q = d.studyQuestions.find((x) => x.id === params.id);
  if (!q) return sendErr(res, 404, '質問が見つかりません。');
  if (!isClaimable(q, teacherOf(user))) return sendErr(res, 400, 'この質問は担当できません（既に担当者がいるか、対応範囲外です）。');
  q.assignedTeacherId = user.linkedId; q.status = '講師確認中'; q.updatedAt = new Date().toISOString();
  const su = d.users.find((u) => u.role === 'student' && u.linkedId === q.studentId);
  if (su) pushNotification(su.id, 'question', q.id, '質問を講師が確認しています。');
  store.markModified(); store.saveSoon();
  audit.record(user, 'claim_question', 'study_question', q.id, null);
  sendJson(res, 200, { question: questionDetailOut(q, user) });
};
api['POST /api/questions/:id/messages'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const q = d.studyQuestions.find((x) => x.id === params.id);
  if (!q || !canViewQuestion(user, q)) return sendErr(res, 404, '質問が見つかりません。');
  const isTeacher = user.role === 'teacher' && q.assignedTeacherId === user.linkedId;
  const isOwner = user.role === 'student' && q.studentUserId === user.id;
  if (!isTeacher && !isOwner) return sendErr(res, 403, 'この質問に投稿する権限がありません。');
  if (q.status === '解決済み') return sendErr(res, 400, 'この質問は解決済みです。');
  const b = await readBody(req);
  const body = str(b.body, 5000).trim();
  let attachments; try { attachments = validateAttachments(b.attachments); } catch (e) { return attErr(res); }
  if (!body && !attachments.length) return sendErr(res, 400, '内容を入力してください。');
  const kind = isTeacher ? 'answer' : 'followup';
  const now = new Date().toISOString();
  d.studyQuestionMessages.push({ id: 'sqm-' + crypto.randomUUID().slice(0, 8), questionId: q.id, senderUserId: user.id, senderRole: user.role, kind, body, attachments, createdAt: now, deleted: false });
  q.updatedAt = now;
  if (!q.reads) q.reads = {};
  q.reads[user.id] = now;
  if (isTeacher) { q.status = '回答あり'; const su = d.users.find((u) => u.role === 'student' && u.linkedId === q.studentId); if (su) pushNotification(su.id, 'question', q.id, '質問に回答が届きました。'); }
  else { q.status = '追加確認中'; const uid = q.assignedTeacherId ? teacherUserId(q.assignedTeacherId) : null; if (uid) pushNotification(uid, 'question', q.id, '質問に追加の確認が届きました。'); }
  store.markModified(); store.saveSoon();
  audit.record(user, 'question_message', 'study_question', q.id, { kind });
  sendJson(res, 200, { question: questionDetailOut(q, user) });
};
api['POST /api/questions/:id/resolve'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const q = d.studyQuestions.find((x) => x.id === params.id);
  if (!q) return sendErr(res, 404, '質問が見つかりません。');
  if (!(user.role === 'student' && q.studentUserId === user.id)) return sendErr(res, 403, '解決済みにできるのは質問した生徒のみです。');
  q.status = '解決済み'; q.updatedAt = new Date().toISOString();
  const uid = q.assignedTeacherId ? teacherUserId(q.assignedTeacherId) : null;
  if (uid) pushNotification(uid, 'question', q.id, '質問が解決済みになりました。');
  store.markModified(); store.saveSoon();
  audit.record(user, 'resolve_question', 'study_question', q.id, null);
  sendJson(res, 200, { question: questionDetailOut(q, user) });
};

// --- フォーム用メタ情報 ---
// ------------------------------------------------------------------
// 補習予約（振替）: フェーズ3
// 先生・教室が「補習可能枠」を登録し、生徒・保護者がその枠を即時予約する（ホットペッパー式）。
// ------------------------------------------------------------------
function mdLabel(dateStr) { const p = (dateStr || '').split('-'); return p.length === 3 ? `${Number(p[1])}/${Number(p[2])}` : dateStr; }
function slotSubjects(slot) {
  if (slot.subjects && slot.subjects.length) return slot.subjects.slice();
  const t = store.db().teachers.find((x) => x.id === slot.teacherId);
  return t ? t.subjects.slice() : [];
}
function activeBookingsForSlot(slotId) {
  return store.db().supplementaryBookings.filter((b) => b.slotId === slotId && b.status === 'confirmed');
}
function slotOut(slot, maps) {
  const [start, end] = PERIODS[slot.period] || ['', ''];
  const booked = activeBookingsForSlot(slot.id).length;
  return {
    id: slot.id, date: slot.date, period: slot.period, start, end,
    teacherId: slot.teacherId, teacherName: maps.teacher[slot.teacherId] || '—',
    subjects: slotSubjects(slot), capacity: slot.capacity || 1,
    booked, remaining: Math.max(0, (slot.capacity || 1) - booked),
    note: slot.note || '', status: slot.status,
  };
}
function supBookingOut(b, maps) {
  const d = store.db();
  const slot = d.supplementarySlots.find((s) => s.id === b.slotId);
  const [start, end] = slot ? (PERIODS[slot.period] || ['', '']) : ['', ''];
  const stu = maps.student[b.studentId] || {};
  return {
    id: b.id, slotId: b.slotId, studentId: b.studentId, studentName: stu.name || '—',
    subject: b.subject, note: b.note || '', status: b.status,
    date: slot ? slot.date : null, period: slot ? slot.period : null, start, end,
    teacherId: slot ? slot.teacherId : null, teacherName: slot ? (maps.teacher[slot.teacherId] || '—') : '—',
    createdAt: b.createdAt, cancelledAt: b.cancelledAt || null,
  };
}
function slotDateOf(slotId) { const s = store.db().supplementarySlots.find((x) => x.id === slotId); return s ? s.date : null; }
function studentHasConflict(studentId, date, period) {
  const d = store.db();
  const lessonConflict = d.lessons.some((l) => l.date === date && l.period === period && l.studentIds.includes(studentId));
  const bookingConflict = d.supplementaryBookings.some((b) => b.status === 'confirmed' && b.studentId === studentId && (() => { const s = d.supplementarySlots.find((x) => x.id === b.slotId); return s && s.date === date && s.period === period; })());
  return lessonConflict || bookingConflict;
}
function teacherHasLesson(teacherId, date, period) {
  return store.db().lessons.some((l) => l.teacherId === teacherId && l.date === date && l.period === period);
}
function upcomingSupplementaryCount(user) {
  const d = store.db(); const today = todayStr();
  let list = d.supplementaryBookings.filter((b) => b.status === 'confirmed');
  if (user.role === 'student' || user.role === 'guardian') { const set = new Set(studentIdsFor(user)); list = list.filter((b) => set.has(b.studentId)); }
  else if (user.role === 'teacher') { const set = new Set(d.supplementarySlots.filter((s) => s.teacherId === user.linkedId).map((s) => s.id)); list = list.filter((b) => set.has(b.slotId)); }
  else if (user.role === 'classroom_admin') { const set = new Set(d.students.filter((s) => s.classroomId === user.classroomId).map((s) => s.id)); list = list.filter((b) => set.has(b.studentId)); }
  return list.filter((b) => { const dt = slotDateOf(b.slotId); return dt && dt >= today; }).length;
}

// 生徒・保護者: 予約可能な空き枠
api['GET /api/supplementary/slots'] = async (req, res, user, url) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'student' && user.role !== 'guardian') return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  const maps = nameMaps();
  const sids = studentIdsFor(user);
  const children = sids.map((id) => { const s = maps.student[id] || {}; return { id, name: s.name, grade: s.grade, subjects: s.subjects || [] }; });
  const today = todayStr();
  const qStudent = url.searchParams.get('studentId');
  const qSubject = url.searchParams.get('subject');
  const qTeacher = url.searchParams.get('teacher');
  const targetStudentId = (qStudent && sids.includes(qStudent)) ? qStudent : sids[0];
  const stu = maps.student[targetStudentId] || {};
  const classroomOpen = d.supplementarySlots.filter((s) => s.status === 'open' && s.date >= today && s.classroomId === stu.classroomId);
  let slots = classroomOpen.filter((s) => slotOut(s, maps).remaining > 0).filter((s) => !studentHasConflict(targetStudentId, s.date, s.period));
  if (qSubject) slots = slots.filter((s) => slotSubjects(s).includes(qSubject));
  if (qTeacher) slots = slots.filter((s) => s.teacherId === qTeacher);
  slots = slots.sort((a, b) => (a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1)));
  const subjectSet = new Set(); classroomOpen.forEach((s) => slotSubjects(s).forEach((x) => subjectSet.add(x)));
  sendJson(res, 200, {
    students: children, targetStudentId,
    subjects: [...subjectSet].sort((a, b) => d.subjects.indexOf(a) - d.subjects.indexOf(b)),
    teachers: [...new Set(classroomOpen.map((s) => s.teacherId))].map((id) => ({ id, name: maps.teacher[id] || '—' })),
    slots: slots.slice(0, 200).map((s) => slotOut(s, maps)),
  });
};

// 生徒・保護者: 自分/子の予約一覧
api['GET /api/supplementary/bookings'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'student' && user.role !== 'guardian') return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  const maps = nameMaps();
  const set = new Set(studentIdsFor(user));
  const list = d.supplementaryBookings.filter((b) => set.has(b.studentId)).map((b) => supBookingOut(b, maps));
  const today = todayStr();
  list.sort((a, b) => {
    const au = a.status === 'confirmed' && a.date >= today, bu = b.status === 'confirmed' && b.date >= today;
    if (au !== bu) return au ? -1 : 1;
    return a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1);
  });
  sendJson(res, 200, { bookings: list });
};

// 生徒・保護者: 予約する（即時確定）
api['POST /api/supplementary/bookings'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'student' && user.role !== 'guardian') return sendErr(res, 403, '予約できるのは生徒・保護者のみです。');
  const b = await readBody(req);
  const d = store.db();
  const slotId = str(b.slotId, 40);
  const studentId = str(b.studentId, 40);
  const subject = str(b.subject, 20);
  const note = str(b.note, 500);
  if (!studentIdsFor(user).includes(studentId)) return sendErr(res, 400, '対象の生徒を選択してください。');
  const slot = d.supplementarySlots.find((s) => s.id === slotId);
  if (!slot || slot.status !== 'open') return sendErr(res, 404, 'この枠は現在予約できません。');
  const stu = d.students.find((s) => s.id === studentId);
  if (!stu || stu.classroomId !== slot.classroomId) return sendErr(res, 400, 'この枠は予約できません。');
  if (slot.date < todayStr()) return sendErr(res, 400, '過去の枠は予約できません。');
  if (!slotSubjects(slot).includes(subject)) return sendErr(res, 400, '科目を選択してください。');
  if (activeBookingsForSlot(slot.id).length >= (slot.capacity || 1)) return sendErr(res, 409, 'この枠は満席になりました。ほかの枠をお選びください。');
  if (studentHasConflict(studentId, slot.date, slot.period)) return sendErr(res, 409, '同じ日時に授業または補習の予定があります。');
  const booking = {
    id: 'sbk-' + crypto.randomUUID().slice(0, 8), slotId: slot.id, studentId, subject, note,
    status: 'confirmed', bookedByUserId: user.id, createdAt: new Date().toISOString(), cancelledAt: null, cancelledByUserId: null,
  };
  d.supplementaryBookings.push(booking);
  d.meta.supplementaryTouched = true;
  store.markModified(); store.saveSoon();
  const tu = d.users.find((u) => u.role === 'teacher' && u.linkedId === slot.teacherId);
  if (tu) pushNotification(tu.id, 'supplementary', booking.id, `${stu.name} さんが ${mdLabel(slot.date)} ${slot.period}限（${subject}）の補習を予約しました。`);
  audit.record(user, 'create_supplementary_booking', 'supplementary_booking', booking.id, { slotId: slot.id, studentId });
  sendJson(res, 201, { booking: supBookingOut(booking, nameMaps()) });
};

// 生徒・保護者・管理者: 予約キャンセル
api['POST /api/supplementary/bookings/:id/cancel'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const booking = d.supplementaryBookings.find((x) => x.id === params.id);
  if (!booking) return sendErr(res, 404, '予約が見つかりません。');
  const canCancel = ((user.role === 'student' || user.role === 'guardian') && studentIdsFor(user).includes(booking.studentId)) || isAdmin(user);
  if (!canCancel) return sendErr(res, 403, 'キャンセルする権限がありません。');
  if (booking.status !== 'confirmed') return sendErr(res, 400, 'この予約はすでにキャンセルされています。');
  booking.status = 'cancelled'; booking.cancelledAt = new Date().toISOString(); booking.cancelledByUserId = user.id;
  store.markModified(); store.saveSoon();
  const slot = d.supplementarySlots.find((s) => s.id === booking.slotId);
  const stu = d.students.find((s) => s.id === booking.studentId);
  if (slot) { const tu = d.users.find((u) => u.role === 'teacher' && u.linkedId === slot.teacherId); if (tu) pushNotification(tu.id, 'supplementary', booking.id, `${stu ? stu.name : '生徒'} さんが ${mdLabel(slot.date)} ${slot.period}限の補習予約をキャンセルしました。`); }
  audit.record(user, 'cancel_supplementary_booking', 'supplementary_booking', booking.id, null);
  sendJson(res, 200, { booking: supBookingOut(booking, nameMaps()) });
};

// 先生・教室: 補習枠の登録
api['POST /api/supplementary/slots'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '補習枠を登録する権限がありません。');
  const b = await readBody(req);
  const d = store.db();
  const date = str(b.date, 10);
  if (!DATE_RE.test(date)) return sendErr(res, 400, '日付を正しく入力してください。');
  if (date < todayStr()) return sendErr(res, 400, '過去の日付には登録できません。');
  const period = Number(b.period);
  if (!PERIODS[period]) return sendErr(res, 400, '時限を選択してください。');
  const teacherId = user.role === 'teacher' ? user.linkedId : str(b.teacherId, 40);
  const teacher = d.teachers.find((t) => t.id === teacherId);
  if (!teacher) return sendErr(res, 400, '担当講師を選択してください。');
  if (user.role === 'classroom_admin' && teacher.classroomId !== user.classroomId) return sendErr(res, 403, '担当講師を選択してください。');
  let subjects = Array.isArray(b.subjects) ? [...new Set(b.subjects.map((s) => str(s, 20)).filter((s) => teacher.subjects.includes(s)))] : [];
  if (!subjects.length) subjects = teacher.subjects.slice();
  const capacity = Math.min(6, Math.max(1, Number(b.capacity) || 1));
  const note = str(b.note, 300);
  if (teacherHasLesson(teacherId, date, period)) return sendErr(res, 409, 'その日時は通常授業が入っています。');
  if (d.supplementarySlots.some((s) => s.status === 'open' && s.teacherId === teacherId && s.date === date && s.period === period)) return sendErr(res, 409, '同じ日時の枠がすでに登録されています。');
  const slot = {
    id: 'sup-' + crypto.randomUUID().slice(0, 8), classroomId: teacher.classroomId, teacherId, date, period,
    subjects, capacity, note, status: 'open', createdByUserId: user.id, createdAt: new Date().toISOString(),
  };
  d.supplementarySlots.push(slot);
  d.meta.supplementaryTouched = true;
  store.markModified(); store.saveSoon();
  audit.record(user, 'create_supplementary_slot', 'supplementary_slot', slot.id, { date, period, teacherId });
  sendJson(res, 201, { slot: slotOut(slot, nameMaps()) });
};

// 先生・教室: 自分の枠と予約状況
api['GET /api/supplementary/slots/manage'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '閲覧権限がありません。');
  const d = store.db();
  const maps = nameMaps();
  const today = todayStr();
  let slots = d.supplementarySlots.filter((s) => s.status === 'open' && s.date >= today);
  if (user.role === 'teacher') slots = slots.filter((s) => s.teacherId === user.linkedId);
  else if (user.role === 'classroom_admin') slots = slots.filter((s) => s.classroomId === user.classroomId);
  slots = slots.sort((a, b) => (a.date === b.date ? a.period - b.period : (a.date < b.date ? -1 : 1)));
  const out = slots.map((s) => {
    const o = slotOut(s, maps);
    o.bookings = activeBookingsForSlot(s.id).map((b) => ({ id: b.id, studentName: (maps.student[b.studentId] || {}).name || '—', subject: b.subject, note: b.note || '', createdAt: b.createdAt }));
    return o;
  });
  let teacherOptions;
  if (user.role === 'teacher') { const t = teacherOf(user); teacherOptions = t ? [{ id: t.id, name: t.name, subjects: t.subjects }] : []; }
  else { let ts = d.teachers; if (user.role === 'classroom_admin') ts = ts.filter((t) => t.classroomId === user.classroomId); teacherOptions = ts.map((t) => ({ id: t.id, name: t.name, subjects: t.subjects })); }
  sendJson(res, 200, { canPickTeacher: isAdmin(user), periods: PERIODS, teacherOptions, slots: out });
};

// 先生・教室: 枠を削除（予約が無い場合のみ）
api['POST /api/supplementary/slots/:id/close'] = async (req, res, user, url, params) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  if (user.role !== 'teacher' && !isAdmin(user)) return sendErr(res, 403, '権限がありません。');
  const d = store.db();
  const slot = d.supplementarySlots.find((s) => s.id === params.id);
  if (!slot) return sendErr(res, 404, '枠が見つかりません。');
  const owns = (user.role === 'teacher' && slot.teacherId === user.linkedId) || user.role === 'system_admin' || (user.role === 'classroom_admin' && slot.classroomId === user.classroomId);
  if (!owns) return sendErr(res, 403, '権限がありません。');
  if (activeBookingsForSlot(slot.id).length) return sendErr(res, 409, '予約が入っているため削除できません。予約者と調整してください。');
  slot.status = 'closed';
  store.markModified(); store.saveSoon();
  audit.record(user, 'close_supplementary_slot', 'supplementary_slot', slot.id, null);
  sendJson(res, 200, { ok: true });
};

api['GET /api/meta'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const d = store.db();
  const out = { subjects: d.subjects, periods: PERIODS, attendance: ATTENDANCE, reportTemplates: REPORT_TEMPLATES };
  if (user.role === 'teacher' || isAdmin(user)) {
    let students = d.students; let teachers = d.teachers;
    if (user.role !== 'system_admin') { students = students.filter((s) => s.classroomId === user.classroomId); teachers = teachers.filter((t) => t.classroomId === user.classroomId); }
    out.students = students.map((s) => ({ id: s.id, name: s.name, grade: s.grade }));
    out.teachers = teachers.map((t) => ({ id: t.id, name: t.name }));
  }
  sendJson(res, 200, out);
};

// --- アカウント設定 ---
api['GET /api/account'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  sendJson(res, 200, { account: publicUser(user) });
};
api['POST /api/account/password'] = async (req, res, user) => {
  if (!user) return sendErr(res, 401, '未ログイン');
  const b = await readBody(req);
  const cur = str(b.current, 200); const next = str(b.next, 200);
  if (!auth.verifyPassword(cur, user.salt, user.hash)) return sendErr(res, 400, '現在のパスワードが正しくありません。');
  if (next.length < 8) return sendErr(res, 400, '新しいパスワードは8文字以上にしてください。');
  const h = auth.hashPassword(next);
  user.salt = h.salt; user.hash = h.hash;
  store.markModified(); store.saveSoon();
  audit.record(user, 'change_password', 'user', user.id, null);
  sendJson(res, 200, { ok: true });
};

// ------------------------------------------------------------------
// ルーティング
// ------------------------------------------------------------------
function matchRoute(method, pathname) {
  const key = `${method} ${pathname}`;
  if (api[key]) return { handler: api[key], params: {} };
  // パラメータ付き
  for (const route of Object.keys(api)) {
    const [m, p] = route.split(' ');
    if (m !== method || !p.includes(':')) continue;
    const rp = p.split('/'); const ap = pathname.split('/');
    if (rp.length !== ap.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (rp[i] !== ap[i]) { ok = false; break; }
    }
    if (ok) return { handler: api[route], params };
  }
  return null;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // API
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    const route = matchRoute(req.method, url.pathname);
    if (!route) return sendErr(res, 404, 'エンドポイントが見つかりません。');
    const user = currentUser(req);
    try {
      await route.handler(req, res, user, url, route.params);
    } catch (e) {
      sendErr(res, e.message === 'too large' ? 413 : 400, '処理できませんでした。');
    }
    return;
  }

  // 静的ファイル & アプリのシェル
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'");
  const sendFile = (fp) => fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
  // ルート = 区分選択ポータル、/staff・/family = それぞれのアプリ（同一SPAを区分付きで配信）
  if (url.pathname === '/') return sendFile(path.join(PUBLIC, 'portal.html'));
  if (/^\/(staff|family)(\/.*)?$/.test(url.pathname)) return sendFile(path.join(PUBLIC, 'index.html'));
  const filePath = path.join(PUBLIC, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  return sendFile(filePath);
});

server.listen(PORT, () => {
  console.log(`\n  LuBo School サーバー起動`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  体験用アカウントはログイン画面に表示されます。\n`);
});
