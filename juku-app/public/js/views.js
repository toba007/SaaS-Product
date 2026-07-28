import { api } from './api.js';
import { h, fmtDate, fmtDateTime, periodLabel, attendanceBadge, confirmBadge, toast, formValues, options } from './ui.js';
import { code39Svg } from './barcode.js';

// 各ビューは async 関数。{ html, mount? } を返す。mount(root, ctx) でイベントを結び付ける。

function card(title, body, headExtra) {
  return `<section class="card">
    ${title ? `<div class="card-head"><h3>${h(title)}</h3>${headExtra || ''}</div>` : ''}
    <div class="card-body${title ? '' : ''}">${body}</div>
  </section>`;
}
function cardTight(title, body, headExtra) {
  return `<section class="card">
    <div class="card-head"><h3>${h(title)}</h3>${headExtra || ''}</div>
    <div class="card-body tight">${body}</div>
  </section>`;
}
function empty(msg) { return `<div class="empty">${h(msg)}</div>`; }
function pendingNote() { return '<span class="badge neutral">準備中（フェーズ2以降）</span>'; }
function unreadBadge(n) { return n > 0 ? `<span class="badge info">未読 ${n}</span>` : ''; }

// ==================================================================
// ダッシュボード
// ==================================================================
export async function dashboard(ctx) {
  const d = await api.get('/api/dashboard');
  if (d.role === 'teacher') return teacherDashboard(d);
  if (d.role === 'student' || d.role === 'guardian') return studentDashboard(d, ctx);
  return adminDashboard(d);
}

function teacherDashboard(d) {
  const today = d.todayLessons.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>時限</th><th>時間</th><th>科目</th><th>生徒</th><th>教室</th></tr></thead><tbody>
        ${d.todayLessons.map((l) => `<tr><td>${periodLabel(l.period)}</td><td>${h(l.start)}–${h(l.end)}</td><td>${h(l.subject)}</td><td>${l.studentNames.map(h).join('、')}</td><td>${h(l.roomName)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('本日の担当授業はありません。');

  const students = d.todayStudents.length
    ? `<ul class="list-plain">${d.todayStudents.map((s) => `<li>${h(s.name)} <span class="muted small">${h(s.grade)}</span></li>`).join('')}</ul>`
    : empty('本日の対象生徒はいません。');

  const unrec = d.unrecorded.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>時限</th><th>科目</th><th>生徒</th><th></th></tr></thead><tbody>
        ${d.unrecorded.map((u) => `<tr><td>${fmtDate(u.lesson.date)}</td><td>${periodLabel(u.lesson.period)}</td><td>${h(u.lesson.subject)}</td><td>${h(u.studentName)}</td>
          <td><a class="btn sm" href="#/records/new?student=${encodeURIComponent(u.lesson.studentIds && u.lesson.studentIds[0] || '')}&lesson=${encodeURIComponent(u.lesson.id)}">記録を作成</a></td></tr>`).join('')}
      </tbody></table></div>`
    : empty('未入力の授業記録はありません。');

  const absent = d.absent.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>生徒</th><th>科目</th><th>確認</th></tr></thead><tbody>
        ${d.absent.map((r) => `<tr class="clickable" data-go="#/records/${r.id}"><td>${fmtDate(r.date)}</td><td>${h(r.studentName)}</td><td>${h(r.subject)}</td><td>${confirmBadge(r.confirmStatus)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('最近の欠席者はいません。');

  const notices = noticeList(d.notices);

  const html = `
    <div class="grid-4">
      <div class="metric"><div class="k">本日の担当授業</div><div class="v">${d.todayLessons.length}</div><div class="s">コマ</div></div>
      <div class="metric"><div class="k">本日の生徒</div><div class="v">${d.todayStudents.length}</div><div class="s">名</div></div>
      <div class="metric"><div class="k">未入力の授業記録</div><div class="v">${d.unrecordedCount}</div><div class="s">件</div></div>
      <div class="metric"><div class="k">在室中</div><div class="v">${d.presentNow}</div><div class="s">／ 本日 ${d.todayStudentCount} 名</div></div>
    </div>
    <div class="grid-2">
      ${cardTight('本日の担当授業', today)}
      ${cardTight('本日の生徒', students, '<a class="btn sm" href="#/checkins">入退室ボード</a>')}
    </div>
    ${cardTight('未入力の授業記録', unrec, `<a class="btn sm primary" href="#/records/new">授業記録を作成</a>`)}
    ${cardTight('欠席した生徒（最近）', absent)}
    ${cardTight('教室からのお知らせ', notices, unreadBadge(d.unreadNotices))}
    ${card('メッセージ ／ 補習予約', `<div class="row between"><span>未読メッセージ <b>${(d.pending && d.pending.unreadMessages) || 0}</b> 件</span><a class="btn sm" href="#/messages">メッセージを開く</a></div><div class="row between" style="margin-top:8px"><span>補習予約（自分の枠） <b>${(d.pending && d.pending.supplementary) || 0}</b> 件</span><a class="btn sm" href="#/supplementary">補習枠を管理</a></div>`)}
  `;
  return { html, mount: bindRowNav };
}

function studentDashboard(d, ctx) {
  const isGuardian = d.role === 'guardian';
  const next = d.nextLesson
    ? `<dl class="kv"><dt>日時</dt><dd>${fmtDate(d.nextLesson.date)} ${periodLabel(d.nextLesson.period)}（${h(d.nextLesson.start)}–${h(d.nextLesson.end)}）</dd>
        <dt>科目</dt><dd>${h(d.nextLesson.subject)}</dd><dt>担当</dt><dd>${h(d.nextLesson.teacherName)}</dd><dt>教室</dt><dd>${h(d.nextLesson.roomName)}</dd></dl>`
    : empty('予定されている授業はありません。');

  const hw = d.homework.length
    ? `<ul class="list-plain">${d.homework.map((r) => `<li><span class="muted small">${fmtDate(r.date)}・${h(r.subject)}</span><br>${h(r.homework)}</li>`).join('')}</ul>`
    : empty('登録されている宿題はありません。');

  const absent = d.absentRecords.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>科目</th><th>担当</th><th>確認</th></tr></thead><tbody>
        ${d.absentRecords.map((r) => `<tr class="clickable" data-go="#/records/${r.id}"><td>${fmtDate(r.date)}</td><td>${h(r.subject)}</td><td>${h(r.teacherName)}</td><td>${confirmBadge(r.confirmStatus)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('欠席した授業の記録はありません。');

  const ci = (d.checkins || []);
  const ciStatusText = (s) => {
    if (s.status === '在室中') return `在室中（${s.checkInAt ? s.checkInAt.slice(11, 16) : ''} 入室）`;
    if (s.status === '退室済') return `退室済（${s.checkInAt ? s.checkInAt.slice(11, 16) : ''}〜${s.checkOutAt ? s.checkOutAt.slice(11, 16) : ''}）`;
    return '未入室';
  };
  const ciBadge = (st) => st === '在室中' ? '<span class="badge ok">在室中</span>' : (st === '退室済' ? '<span class="badge neutral">退室済</span>' : '<span class="badge warn">未入室</span>');
  const checkinCard = ci.length
    ? `<ul class="list-plain">${ci.map((s) => `<li class="row between"><span>${h(s.name)} <span class="muted small">${h(s.grade)}</span></span><span>${ciBadge(s.status)} <span class="muted small">${h(ciStatusText(s))}</span></span></li>`).join('')}</ul>`
    : empty('本日の入退室情報はありません。');
  const firstStatus = ci[0] ? ci[0].status : '—';

  const html = `
    <div class="grid-3">
      <div class="metric"><div class="k">${isGuardian ? 'お子さま' : '氏名'}</div><div class="v" style="font-size:18px">${d.children.map((c) => h(c.name)).join('、') || '—'}</div><div class="s">${d.children.map((c) => h(c.grade)).join('、')}</div></div>
      <div class="metric"><div class="k">本日の入退室</div><div class="v" style="font-size:18px">${h(firstStatus)}</div><div class="s">${ci[0] && ci[0].checkInAt ? ci[0].checkInAt.slice(11, 16) + ' 入室' : '—'}</div></div>
      <div class="metric"><div class="k">宿題</div><div class="v">${d.homework.length}</div><div class="s">件</div></div>
    </div>
    ${cardTight('本日の入退室', checkinCard)}
    <div class="grid-2">
      ${card('次回の授業', next)}
      ${cardTight('宿題', hw)}
    </div>
    ${cardTight('欠席した授業の記録', absent)}
    ${cardTight('塾からのお知らせ', noticeList(d.notices), unreadBadge(d.unreadNotices))}
    ${card('メッセージ ／ 補習予約', `<div class="row between"><span>未読メッセージ <b>${(d.pending && d.pending.unreadMessages) || 0}</b> 件</span><a class="btn sm" href="#/messages">メッセージを開く</a></div><div class="row between" style="margin-top:8px"><span>補習（振替）予約 <b>${(d.pending && d.pending.supplementary) || 0}</b> 件</span><a class="btn sm primary" href="#/supplementary">補習を予約</a></div>`)}
  `;
  return { html, mount: bindRowNav };
}

function adminDashboard(d) {
  const loadRows = d.load.length
    ? d.load.map((t) => `<tr><td>${h(t.name)}</td><td>${t.count} コマ</td><td>${t.over ? '<span class="badge warn">偏り注意</span>' : '<span class="badge neutral">—</span>'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">データがありません</td></tr>';

  const presentCard = (d.presentList && d.presentList.length)
    ? `<ul class="list-plain">${d.presentList.map((p) => `<li class="row between"><span><span class="dotmark in"></span>${h(p.name)}</span><span class="muted small checkin-time">${p.checkInAt ? p.checkInAt.slice(11, 16) + ' 入室' : ''}</span></li>`).join('')}</ul>`
    : empty('現在、在室中の生徒はいません。');

  const html = `
    <div class="grid-4">
      <div class="metric"><div class="k">本日の授業数</div><div class="v">${d.todayLessonCount}</div><div class="s">コマ</div></div>
      <div class="metric"><div class="k">出席予定者</div><div class="v">${d.expected}</div><div class="s">名</div></div>
      <div class="metric"><div class="k">在室中</div><div class="v">${d.presentNow}</div><div class="s">名</div></div>
      <div class="metric"><div class="k">本日の欠席</div><div class="v">${d.absentToday}</div><div class="s">名</div></div>
    </div>
    <div class="grid-2">
      ${cardTight('現在の在室者', presentCard, '<a class="btn sm" href="#/checkins">入退室ボード</a>')}
      ${cardTight('講師ごとの担当数（今後7日）', `<div class="table-wrap"><table class="tbl"><thead><tr><th>講師</th><th>担当コマ数</th><th>状態</th></tr></thead><tbody>${loadRows}</tbody></table></div>`,
        `<span class="muted small">出勤 ${d.workingTeachers.length}名・平均 ${d.loadAvg} コマ</span>`)}
    </div>
    <div class="grid-3">
      ${card('今後の補習予約', `<div class="v" style="font-size:22px;font-weight:700">${d.pending && d.pending.supplementary != null ? d.pending.supplementary : '—'}</div><div class="muted small">確定済みの件数</div><div style="margin-top:8px"><a class="btn sm" href="#/supplementary">補習枠を管理</a></div>`)}
      ${card('未対応の相談', `<div class="v" style="font-size:22px;font-weight:700">${d.openConsultations != null ? d.openConsultations : '—'}</div><div class="muted small">未確認 ${d.unconfirmedConsultations || 0} 件</div><div style="margin-top:8px"><a class="btn sm" href="#/consultations">相談管理へ</a></div>`)}
      ${card('時間割上の警告', `<div class="v" style="font-size:22px;font-weight:700">—</div>${pendingNote()}`)}
    </div>
    ${cardTight('お知らせ', noticeList(d.notices), unreadBadge(d.unreadNotices))}
  `;
  return { html, mount: bindRowNav };
}

function noticeList(list) {
  if (!list || !list.length) return empty('お知らせはありません。');
  return list.map((n) => `<div class="notice-item"><div class="t">${n.read === false ? '<span class="badge info" style="margin-right:6px">未読</span>' : ''}${h(n.title)}</div><div class="d">${fmtDateTime(n.createdAt)}</div><div class="small" style="margin-top:4px">${h(n.body)}</div></div>`).join('');
}

function bindRowNav(root) {
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.getAttribute('data-go'); }));
}

// ==================================================================
// 授業記録一覧
// ==================================================================
export async function records(ctx) {
  const canFilter = ctx.user.role === 'teacher' || ctx.user.role === 'classroom_admin' || ctx.user.role === 'system_admin';
  let meta = { subjects: [], students: [], teachers: [] };
  try { meta = await api.get('/api/meta'); } catch (e) { /* 生徒/保護者は最小限 */ }
  const canCreate = ctx.user.role === 'teacher' || ctx.user.role === 'classroom_admin' || ctx.user.role === 'system_admin';

  const filters = `
    <form id="filters" class="filters">
      <div class="field"><label>キーワード</label><input name="q" placeholder="生徒名・科目"></div>
      ${meta.subjects && meta.subjects.length ? `<div class="field"><label>科目</label><select name="subject"><option value="">すべて</option>${options(meta.subjects, '')}</select></div>` : ''}
      ${canFilter && meta.students ? `<div class="field"><label>生徒</label><select name="student"><option value="">すべて</option>${options(meta.students, '', 'id', (s) => `${s.name}（${s.grade}）`)}</select></div>` : ''}
      ${canFilter && meta.teachers ? `<div class="field"><label>担当講師</label><select name="teacher"><option value="">すべて</option>${options(meta.teachers, '', 'id', (t) => t.name)}</select></div>` : ''}
      <div class="field"><label>確認状況</label><select name="confirm"><option value="">すべて</option><option value="未確認">未確認</option><option value="確認済み">確認済み</option></select></div>
      <button class="btn" type="submit">絞り込む</button>
    </form>`;

  const head = canCreate ? `<a class="btn sm primary" href="#/records/new">授業記録を作成</a>` : '';
  const html = `
    ${card('検索・絞り込み', filters)}
    ${cardTight('授業記録', '<div id="rec-list">読み込み中…</div>', head)}
  `;

  async function load(root, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const data = await api.get('/api/lesson-records' + (qs ? '?' + qs : ''));
    const list = data.records;
    const target = root.querySelector('#rec-list');
    if (!list.length) { target.innerHTML = empty('該当する授業記録はありません。'); return; }
    target.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>生徒</th><th>科目</th><th>出欠</th><th>担当講師</th><th>確認状況</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="clickable" data-go="#/records/${r.id}">
        <td>${fmtDate(r.date)} ${periodLabel(r.period)}</td><td>${h(r.studentName)}</td><td>${h(r.subject)}</td>
        <td>${attendanceBadge(r.attendance)}</td><td>${h(r.teacherName)}</td><td>${confirmBadge(r.confirmStatus)}</td></tr>`).join('')}
    </tbody></table></div>`;
    bindRowNav(target);
  }

  return {
    html,
    mount: (root) => {
      load(root, {});
      const form = root.querySelector('#filters');
      form.addEventListener('submit', (e) => { e.preventDefault(); load(root, formValues(form)); });
    },
  };
}

// ==================================================================
// 授業記録の作成
// ==================================================================
export async function recordNew(ctx) {
  if (!(ctx.user.role === 'teacher' || ctx.user.role === 'classroom_admin' || ctx.user.role === 'system_admin')) {
    return { html: card('権限がありません', '<p class="muted">この画面は講師・管理者のみ利用できます。</p>') };
  }
  const meta = await api.get('/api/meta');
  const isTeacher = ctx.user.role === 'teacher';
  const today = new Date().toISOString().slice(0, 10);
  const pre = ctx.query || {};

  const html = `
    <a class="back-link" href="#/records">← 授業記録一覧へ戻る</a>
    ${card('授業記録を作成', `
      <div id="form-err" class="form-error" hidden></div>
      <form id="rec-form" class="form-grid">
        <div class="field"><label>生徒 <span class="req">*</span></label>
          <select name="studentId" required><option value="">選択してください</option>${options(meta.students || [], pre.student || '', 'id', (s) => `${s.name}（${s.grade}）`)}</select></div>
        <div class="field"><label>授業日 <span class="req">*</span></label><input type="date" name="date" value="${today}" required></div>
        <div class="field"><label>授業時間 <span class="req">*</span></label>
          <select name="period" required>${[1, 2, 3, 4].map((p) => `<option value="${p}">${p}限（${meta.periods[p][0]}–${meta.periods[p][1]}）</option>`).join('')}</select></div>
        <div class="field"><label>科目 <span class="req">*</span></label><select name="subject" required>${options(meta.subjects, '')}</select></div>
        <div class="field"><label>担当講師 <span class="req">*</span></label>
          ${isTeacher ? `<input value="${h(ctx.user.name)}" disabled><input type="hidden" name="teacherId" value="">` : `<select name="teacherId" required><option value="">選択してください</option>${options(meta.teachers || [], '', 'id', (t) => t.name)}</select>`}</div>
        <div class="field"><label>出欠 <span class="req">*</span></label><select name="attendance" required>${options(meta.attendance, '出席')}</select></div>
        <div class="field full"><label>授業で進んだ内容</label><textarea name="progress" placeholder="扱った単元・範囲など"></textarea><div class="tmpl-chips" id="tmpl-progress"></div></div>
        <div class="field full"><label>宿題</label><textarea name="homework"></textarea><div class="tmpl-chips" id="tmpl-homework"></div></div>
        <div class="field full"><label>次回までに確認すること</label><textarea name="checkNext"></textarea></div>
        <div class="field full"><label>生徒へのコメント</label><textarea name="comment"></textarea><div class="tmpl-chips" id="tmpl-comment"></div></div>
        <div class="field full"><label>添付資料（プリント名など）</label><input name="attachment" placeholder="例：英語 補充プリントNo.3"></div>
        <div class="field full"><label>次回予定</label><textarea name="nextPlan"></textarea></div>
        <div class="field full">
          <p class="muted small" style="margin:0 0 10px">出欠を「欠席」にして保存すると、この記録は生徒・保護者に共有され、確認状況を記録します。</p>
          <button class="btn primary" type="submit">授業記録を保存</button>
        </div>
      </form>`)}
  `;

  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#rec-form');

      // 定型文チップ（Comiru/wagaco の指導報告テンプレートを参考に入力を短縮）
      const tpl = meta.reportTemplates || { progress: { _common: [] }, homework: { _common: [] }, comment: { _common: [] } };
      const chipHtml = (arr) => arr.map((t) => `<button type="button" data-tmpl="${h(t)}">＋ ${h(t)}</button>`).join('');
      const bindChips = (container, textarea) => container.querySelectorAll('[data-tmpl]').forEach((b) => b.addEventListener('click', () => {
        const t = b.getAttribute('data-tmpl');
        textarea.value = textarea.value.trim() ? textarea.value.replace(/\s+$/, '') + '\n' + t : t;
        textarea.focus();
      }));
      const progC = root.querySelector('#tmpl-progress');
      const renderProg = () => { const s = form.subject.value; const arr = [...(tpl.progress[s] || []), ...(tpl.progress._common || [])]; progC.innerHTML = chipHtml(arr); bindChips(progC, form.progress); };
      form.subject.addEventListener('change', renderProg); renderProg();
      const hwC = root.querySelector('#tmpl-homework'); hwC.innerHTML = chipHtml(tpl.homework._common || []); bindChips(hwC, form.homework);
      const cmC = root.querySelector('#tmpl-comment'); cmC.innerHTML = chipHtml(tpl.comment._common || []); bindChips(cmC, form.comment);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const payload = {
          studentId: v.studentId, date: v.date, period: Number(v.period), subject: v.subject,
          attendance: v.attendance, progress: v.progress, homework: v.homework,
          checkNext: v.checkNext, comment: v.comment, nextPlan: v.nextPlan,
          attachments: v.attachment ? [{ label: v.attachment }] : [],
        };
        if (!isTeacher) payload.teacherId = v.teacherId;
        const errBox = root.querySelector('#form-err');
        try {
          const res = await api.post('/api/lesson-records', payload);
          toast('授業記録を保存しました。');
          location.hash = '#/records/' + res.record.id;
        } catch (err) {
          errBox.textContent = err.message; errBox.hidden = false;
          errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    },
  };
}

// ==================================================================
// 授業記録の詳細
// ==================================================================
export async function recordDetail(ctx) {
  const data = await api.get('/api/lesson-records/' + encodeURIComponent(ctx.params.id));
  const r = data.record;
  const role = ctx.user.role;
  const canConfirm = (role === 'student' || role === 'guardian') && (r.sharedWithStudent || r.sharedWithGuardian);
  const alreadyConfirmed = role === 'student' ? r.confirmedByStudentAt : r.confirmedByGuardianAt;

  const shareInfo = (r.sharedWithStudent || r.sharedWithGuardian)
    ? `<div class="row" style="margin-top:4px">
        <span class="small muted">生徒確認：</span>${r.confirmedByStudentAt ? `<span class="badge ok">${fmtDate(r.confirmedByStudentAt)}</span>` : '<span class="badge warn">未確認</span>'}
        <span class="small muted">保護者確認：</span>${r.confirmedByGuardianAt ? `<span class="badge ok">${fmtDate(r.confirmedByGuardianAt)}</span>` : '<span class="badge warn">未確認</span>'}
      </div>` : '';

  const field = (label, val) => `<div class="section-label">${h(label)}</div><div style="margin-bottom:12px;white-space:pre-wrap">${val ? h(val) : '<span class="muted">（記載なし）</span>'}</div>`;

  const html = `
    <a class="back-link" href="#/records">← 授業記録一覧へ戻る</a>
    ${card(`${fmtDate(r.date)} ${periodLabel(r.period)}　${r.subject}`, `
      <dl class="kv">
        <dt>生徒</dt><dd>${h(r.studentName)} <span class="muted small">${h(r.studentGrade)}</span></dd>
        <dt>担当講師</dt><dd>${h(r.teacherName)}</dd>
        <dt>出欠</dt><dd>${attendanceBadge(r.attendance)}${r.attendance === '欠席' ? ' <span class="muted small">この記録は生徒・保護者に共有されています</span>' : ''}</dd>
      </dl>
      ${shareInfo}
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
      ${field('授業で進んだ内容', r.progress)}
      ${field('宿題', r.homework)}
      ${field('次回までに確認すること', r.checkNext)}
      ${field('生徒へのコメント', r.comment)}
      ${field('次回予定', r.nextPlan)}
      ${r.attachments && r.attachments.length ? field('添付資料', r.attachments.map((a) => a.label).join('、')) : ''}
      ${canConfirm ? `<div style="margin-top:8px">${alreadyConfirmed ? '<span class="badge ok">確認済みです</span>' : '<button class="btn primary" id="confirm-btn">内容を確認しました</button>'}</div>` : ''}
    `)}
  `;

  return {
    html,
    mount: (root) => {
      const btn = root.querySelector('#confirm-btn');
      if (btn) btn.addEventListener('click', async () => {
        try { await api.post('/api/lesson-records/' + r.id + '/confirm', {}); toast('確認を記録しました。'); ctx.reload(); }
        catch (err) { toast(err.message, true); }
      });
    },
  };
}

// ==================================================================
// 生徒一覧・詳細
// ==================================================================
export async function students(ctx) {
  const data = await api.get('/api/students');
  const rows = data.students.length
    ? data.students.map((s) => `<tr class="clickable" data-go="#/students/${s.id}"><td>${h(s.name)}</td><td>${h(s.grade)}</td><td>${(s.subjects || []).map(h).join('、')}</td><td><span class="badge neutral">${h(s.status)}</span></td></tr>`).join('')
    : '';
  const html = cardTight('生徒一覧', data.students.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>氏名</th><th>学年</th><th>受講科目</th><th>状態</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : empty('表示できる生徒がいません。'),
    `<span class="muted small">${data.students.length} 名</span>`);
  return { html, mount: bindRowNav };
}

export async function studentDetail(ctx) {
  const data = await api.get('/api/students/' + encodeURIComponent(ctx.params.id));
  const s = data.student;
  const g = s.guardians && s.guardians.length
    ? s.guardians.map((x) => `<dd>${h(x.name)}（${h(x.relation || '保護者')}）　${h(x.phone || '')}　${h(x.email || '')}</dd>`).join('')
    : '';
  const recs = data.records.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>科目</th><th>出欠</th><th>担当</th><th>確認</th></tr></thead><tbody>
        ${data.records.map((r) => `<tr class="clickable" data-go="#/records/${r.id}"><td>${fmtDate(r.date)} ${periodLabel(r.period)}</td><td>${h(r.subject)}</td><td>${attendanceBadge(r.attendance)}</td><td>${h(r.teacherName)}</td><td>${confirmBadge(r.confirmStatus)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('授業記録はありません。');

  const html = `
    <a class="back-link" href="#/students">← 生徒一覧へ戻る</a>
    ${card(s.name, `
      <dl class="kv">
        <dt>学年</dt><dd>${h(s.grade)}</dd>
        <dt>受講科目</dt><dd>${(s.subjects || []).map(h).join('、')}</dd>
        <dt>状態</dt><dd>${h(s.status)}</dd>
        ${s.guardians ? `<dt>保護者</dt>${g}` : ''}
        ${s.careNote !== undefined ? `<dt>配慮事項</dt><dd>${s.careNote ? h(s.careNote) : '<span class="muted">なし</span>'} <span class="badge neutral">管理者のみ表示</span></dd>` : ''}
      </dl>`)}
    ${cardTight('授業記録', recs)}
  `;
  return { html, mount: bindRowNav };
}

// ==================================================================
// 講師一覧・詳細
// ==================================================================
export async function teachers(ctx) {
  const data = await api.get('/api/teachers');
  const rows = data.teachers.map((t) => `<tr class="clickable" data-go="#/teachers/${t.id}"><td>${h(t.name)}</td><td>${(t.subjects || []).map(h).join('、')}</td><td>${(t.grades || []).map(h).join('、')}</td><td><span class="badge neutral">${h(t.employmentType)}</span></td></tr>`).join('');
  const html = cardTight('講師一覧', data.teachers.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>氏名</th><th>担当科目</th><th>担当学年</th><th>勤務</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : empty('表示できる講師がいません。'),
    `<span class="muted small">${data.teachers.length} 名</span>`);
  return { html, mount: bindRowNav };
}

export async function teacherDetail(ctx) {
  const data = await api.get('/api/teachers/' + encodeURIComponent(ctx.params.id));
  const t = data.teacher;
  const up = data.upcoming.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>授業日</th><th>時限</th><th>科目</th><th>生徒</th><th>教室</th></tr></thead><tbody>
        ${data.upcoming.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${periodLabel(l.period)}</td><td>${h(l.subject)}</td><td>${l.studentNames.map(h).join('、')}</td><td>${h(l.roomName)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('予定されている授業はありません。');
  const html = `
    <a class="back-link" href="#/teachers">← 講師一覧へ戻る</a>
    ${card(t.name, `<dl class="kv"><dt>担当科目</dt><dd>${(t.subjects || []).map(h).join('、')}</dd><dt>担当学年</dt><dd>${(t.grades || []).map(h).join('、')}</dd><dt>勤務形態</dt><dd>${h(t.employmentType)}</dd></dl>`)}
    ${cardTight('今後の担当授業', up)}
  `;
  return { html, mount: bindRowNav };
}

// ==================================================================
// お知らせ一覧
// ==================================================================
export async function notices(ctx) {
  const data = await api.get('/api/notices');
  const unread = data.notices.filter((n) => !n.read);
  const render = (list) => (list.length ? noticeList(list) : empty('お知らせはありません。'));
  const html = `<section class="card">
    <div class="tabs" id="ntabs">
      <button class="tab active" data-f="all">すべて<span class="count">${data.notices.length}</span></button>
      <button class="tab" data-f="unread">未読<span class="count">${data.unread}</span></button>
    </div>
    <div class="card-body tight" id="nlist">${render(data.notices)}</div>
  </section>`;
  return {
    html,
    mount: async (root) => {
      const listEl = root.querySelector('#nlist');
      root.querySelectorAll('#ntabs .tab').forEach((t) => t.addEventListener('click', () => {
        root.querySelectorAll('#ntabs .tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const f = t.getAttribute('data-f');
        listEl.innerHTML = render(f === 'unread' ? data.notices.filter((n) => !n.read) : data.notices);
      }));
      // 開いた時点で未読を既読化（ヘッダーの通知数にも反映）
      for (const n of unread) { try { await api.post('/api/notices/' + n.id + '/read', {}); } catch (e) { /* noop */ } }
    },
  };
}

// ==================================================================
// 入退室ボード（Comiru/wagaco/BitCampus の入退室管理を参考）
// ==================================================================
export async function checkins(ctx) {
  function timeStr(t) { return t ? t.slice(11, 16) : ''; }
  function rowHtml(s) {
    const cls = s.status === '在室中' ? 'in' : (s.status === '退室済' ? 'out' : 'none');
    const badge = s.status === '在室中' ? '<span class="badge ok">在室中</span>' : (s.status === '退室済' ? '<span class="badge neutral">退室済</span>' : '<span class="badge warn">未入室</span>');
    const times = [s.checkInAt ? '入室 ' + timeStr(s.checkInAt) : '', s.checkOutAt ? '退室 ' + timeStr(s.checkOutAt) : ''].filter(Boolean).join(' / ');
    return `<tr>
      <td><span class="dotmark ${cls}"></span><span class="checkin-name">${h(s.name)}</span> <span class="muted small">${h(s.grade)}</span></td>
      <td>${badge}</td>
      <td class="checkin-time small muted">${h(times)}</td>
      <td class="row"><button class="btn sm primary" data-in="${h(s.studentId)}"${s.status === '在室中' ? ' disabled' : ''}>入室</button>
        <button class="btn sm" data-out="${h(s.studentId)}"${s.status === '未入室' ? ' disabled' : ''}>退室</button></td>
    </tr>`;
  }

  async function load(root) {
    const data = await api.get('/api/checkins');
    root.querySelector('#ci-body').innerHTML = data.students.length
      ? data.students.map(rowHtml).join('')
      : '<tr><td colspan="4" class="muted" style="padding:20px">本日の対象生徒がいません。</td></tr>';
    root.querySelector('#ci-present').textContent = data.present;
    bind(root);
  }
  function bind(root) {
    root.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => act(root, b.getAttribute('data-in'), 'in')));
    root.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => act(root, b.getAttribute('data-out'), 'out')));
  }
  async function act(root, studentId, action) {
    try { await api.post('/api/checkins', { studentId, action }); toast(action === 'in' ? '入室を記録しました。' : '退室を記録しました。'); load(root); }
    catch (e) { toast(e.message, true); }
  }

  // バーコードのスキャン結果の表示
  function showScan(el, res) {
    const t = res.at ? res.at.slice(11, 16) : '';
    const label = res.action === 'in' ? '入室' : '退室';
    const badge = res.action === 'in' ? 'ok' : 'neutral';
    el.className = 'scan-result ' + (res.action === 'in' ? 'ok' : 'out');
    el.innerHTML = `<span class="badge ${badge}">${label}</span> <b>${h(res.name)}</b> <span class="muted small">${h(res.grade || '')}</span> <span class="checkin-time" style="margin-left:auto">${h(t)}</span>`;
  }
  function showScanErr(el, msg) { el.className = 'scan-result err'; el.textContent = msg; }

  const scanCard = `<section class="card">
    <div class="card-head"><h3>バーコードで入退室</h3><a class="btn sm" href="#/checkins/cards">バーコード印刷</a></div>
    <div class="card-body">
      <form id="scan-form" class="row" style="gap:8px">
        <input id="scan-input" placeholder="バーコードをスキャン（例: LB001）" autocomplete="off" spellcheck="false" style="max-width:320px">
        <button class="btn primary" type="submit">記録</button>
        <span class="muted small">バーコードリーダーは末尾のEnterで自動送信されます</span>
      </form>
      <div id="scan-feedback" style="margin-top:12px"></div>
    </div>
  </section>`;

  const board = cardTight('入退室（本日）',
    `<div class="table-wrap"><table class="tbl"><thead><tr><th>生徒</th><th>状態</th><th>時刻</th><th style="width:180px">操作</th></tr></thead><tbody id="ci-body"><tr><td colspan="4" class="muted" style="padding:20px">読み込み中…</td></tr></tbody></table></div>`,
    `<span class="muted small">在室中 <b id="ci-present">0</b> 名　<button class="btn sm" id="ci-reload">更新</button></span>`);

  return {
    html: `${scanCard}${board}`,
    mount: (root) => {
      load(root);
      const input = root.querySelector('#scan-input');
      const fb = root.querySelector('#scan-feedback');
      const form = root.querySelector('#scan-form');
      const focus = () => { if (input && document.body.contains(input)) input.focus(); };
      focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = input.value.trim();
        input.value = '';
        if (!code) return focus();
        try { const res = await api.post('/api/checkins/scan', { code }); showScan(fb, res); load(root); }
        catch (err) { showScanErr(fb, err.message); }
        focus();
      });
      const rb = root.querySelector('#ci-reload'); if (rb) rb.addEventListener('click', () => load(root));
      // 画面が表示されている間だけ自動更新（離脱時は自己停止）
      const timer = setInterval(() => { if (!document.body.contains(root)) { clearInterval(timer); return; } load(root); }, 20000);
    },
  };
}

// ==================================================================
// 入退室バーコードカード（配布・印刷用）
// ==================================================================
export async function barcodeCards(ctx) {
  const data = await api.get('/api/students');
  const list = data.students.filter((s) => s.barcode);
  const cards = list.map((s) => `<div class="bc-card">
      <div class="bc-head">飯能教室　入退室カード</div>
      <div class="bc-name">${h(s.name)} <span class="muted small">${h(s.grade)}</span></div>
      <div class="bc-svg">${code39Svg(s.barcode)}</div>
    </div>`).join('');
  const html = `
    <a class="back-link" href="#/checkins">← 入退室へ戻る</a>
    <section class="card">
      <div class="card-head"><h3>入退室バーコード（生徒カード）</h3><button class="btn sm primary" id="print-btn">印刷</button></div>
      <div class="card-body">
        <p class="muted small" style="margin:0 0 14px">各生徒に配布するバーコードカードです。印刷して切り取り、入退室画面でスキャンすると出欠を記録できます（規格：CODE39）。</p>
        <div class="bc-grid">${cards || empty('生徒がいません。')}</div>
      </div>
    </section>`;
  return { html, mount: (root) => { const b = root.querySelector('#print-btn'); if (b) b.addEventListener('click', () => window.print()); } };
}

// ==================================================================
// 相談・通報
// ==================================================================
const CONSULT_STATUS_CLASS = { '未確認': 'warn', '確認中': 'info', '対応中': 'info', '解決': 'ok', '保留': 'neutral' };
const URGENCY_CLASS = { '高': 'danger', '中': 'warn', '低': 'neutral' };
function cStatusBadge(s) { return `<span class="badge ${CONSULT_STATUS_CLASS[s] || 'neutral'}">${h(s)}</span>`; }
function cUrgencyBadge(u) { return `<span class="badge ${URGENCY_CLASS[u] || 'neutral'}">緊急度 ${h(u)}</span>`; }
function emergencyCallout() {
  return `<div class="callout"><b>緊急のときは、この機能ではなく直接ご連絡ください。</b><br>
    事件・事故は <b>110番</b>、火事・救急は <b>119番</b>、その他の緊急時は保護者・教室へ直接ご連絡ください。<br>
    <span class="muted small">相談窓口の対応時間：平日 13:00〜21:00（時間外の返信は翌営業日以降になります）</span></div>`;
}

export async function consultations(ctx) {
  const data = await api.get('/api/consultations');
  return data.isAdmin ? consultationsAdmin(data) : consultationsMine(data);
}

function consultationsMine(data) {
  const rows = data.consultations.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>受付日時</th><th>種類</th><th>緊急度</th><th>状態</th></tr></thead><tbody>
        ${data.consultations.map((c) => `<tr class="clickable" data-go="#/consultations/${c.id}"><td>${fmtDateTime(c.createdAt)}</td><td>${h(c.category)}</td><td>${cUrgencyBadge(c.urgency)}</td><td>${cStatusBadge(c.status)}</td></tr>`).join('')}
      </tbody></table></div>`
    : empty('送信した相談はありません。');
  const html = `${emergencyCallout()}
    ${cardTight('相談・通報', rows, '<a class="btn sm primary" href="#/consultations/new">新しい相談を送信</a>')}`;
  return { html, mount: bindRowNav };
}

function consultationsAdmin(data) {
  const filters = `<form id="cfilter" class="filters">
      <div class="field"><label>状態</label><select name="status"><option value="">すべて</option>${options(data.statuses, '')}</select></div>
      <div class="field"><label>種類</label><select name="category"><option value="">すべて</option>${options(data.categories, '')}</select></div>
      <div class="field"><label>緊急度</label><select name="urgency"><option value="">すべて</option>${options(data.urgency, '')}</select></div>
      <button class="btn" type="submit">絞り込む</button>
    </form>`;
  async function load(root, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const d = await api.get('/api/consultations' + (qs ? '?' + qs : ''));
    const t = root.querySelector('#clist');
    t.innerHTML = d.consultations.length
      ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>受付日時</th><th>種類</th><th>緊急度</th><th>相談者</th><th>担当</th><th>状態</th></tr></thead><tbody>
          ${d.consultations.map((c) => `<tr class="clickable" data-go="#/consultations/${c.id}"><td>${fmtDateTime(c.createdAt)}</td><td>${h(c.category)}</td><td>${cUrgencyBadge(c.urgency)}</td><td>${h(c.submitter)}</td><td>${c.assignee ? h(c.assignee) : '<span class="muted">未割当</span>'}</td><td>${cStatusBadge(c.status)}</td></tr>`).join('')}
        </tbody></table></div>`
      : empty('該当する相談はありません。');
    bindRowNav(t);
  }
  const html = `${card('絞り込み', filters)}
    ${cardTight('相談管理', '<div id="clist" style="padding:0"></div>')}`;
  return { html, mount: (root) => { load(root, {}); const f = root.querySelector('#cfilter'); f.addEventListener('submit', (e) => { e.preventDefault(); load(root, formValues(f)); }); } };
}

export async function consultationNew(ctx) {
  const cats = ['授業について', '人間関係', '講師について', '生徒について', 'ハラスメント', '贔屓や不公平', '体調・安全', 'その他'];
  const urg = ['低', '中', '高'];
  const html = `
    <a class="back-link" href="#/consultations">← 相談一覧へ戻る</a>
    ${emergencyCallout()}
    ${card('相談・通報の送信', `
      <div id="form-err" class="form-error" hidden></div>
      <form id="c-form" class="form-grid">
        <div class="field"><label>相談の種類 <span class="req">*</span></label><select name="category" required><option value="">選択してください</option>${options(cats, '')}</select></div>
        <div class="field"><label>緊急度 <span class="req">*</span></label><select name="urgency" required>${options(urg, '中')}</select></div>
        <div class="field full"><label>対象者（任意）</label><input name="target" placeholder="例：〇〇の授業／自習室 など"></div>
        <div class="field full"><label>内容 <span class="req">*</span></label><textarea name="body" required placeholder="できるだけ具体的にご記入ください。"></textarea></div>
        <div class="field full"><label>添付資料（ファイル名など・任意）</label><input name="attachment"></div>
        <div class="field full"><label style="font-weight:400"><input type="checkbox" name="anonymous" style="width:auto;margin-right:6px">匿名で送信する（担当者に氏名を表示しません）</label></div>
        <div class="field full"><label style="font-weight:400"><input type="checkbox" name="wantsReply" style="width:auto;margin-right:6px" checked>返信を希望する</label></div>
        <div class="field full"><button class="btn primary" type="submit">相談を送信</button></div>
      </form>`)}`;
  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#c-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const payload = {
          category: v.category, urgency: v.urgency, target: v.target, body: v.body,
          anonymous: form.anonymous.checked, wantsReply: form.wantsReply.checked,
          attachments: v.attachment ? [{ label: v.attachment }] : [],
        };
        const errBox = root.querySelector('#form-err');
        try { const r = await api.post('/api/consultations', payload); toast('相談を送信しました。'); location.hash = '#/consultations/' + r.id; }
        catch (err) { errBox.textContent = err.message; errBox.hidden = false; }
      });
    },
  };
}

export async function consultationDetail(ctx) {
  const data = await api.get('/api/consultations/' + encodeURIComponent(ctx.params.id));
  const c = data.consultation;
  const isAdminView = c.staffOptions !== undefined;
  const responses = (c.responses || []).length
    ? `<div class="thread">${c.responses.map((r) => `<div class="thread-item"><div class="d">${fmtDateTime(r.at)}・${h(r.by)}${r.status ? `（${h(r.status)}）` : ''}</div><div class="t">${h(r.text)}</div></div>`).join('')}</div>`
    : '<div class="muted small">まだ返信・対応記録はありません。</div>';

  const info = `<dl class="kv">
      <dt>受付日時</dt><dd>${fmtDateTime(c.createdAt)}</dd>
      <dt>種類</dt><dd>${h(c.category)}</dd>
      <dt>緊急度</dt><dd>${cUrgencyBadge(c.urgency)}</dd>
      ${c.target ? `<dt>対象</dt><dd>${h(c.target)}</dd>` : ''}
      ${isAdminView ? `<dt>相談者</dt><dd>${h(c.submitter)}${c.anonymous ? ' <span class="badge neutral">匿名希望</span>' : ''}</dd>` : ''}
      <dt>返信希望</dt><dd>${c.wantsReply ? 'あり' : 'なし'}</dd>
      <dt>状態</dt><dd>${cStatusBadge(c.status)}</dd>
      ${c.attachments && c.attachments.length ? `<dt>添付</dt><dd>${c.attachments.map((a) => h(a.label)).join('、')}</dd>` : ''}
    </dl>
    <div class="section-label" style="margin-top:14px">内容</div>
    <div style="white-space:pre-wrap">${h(c.body)}</div>`;

  let manage = '';
  if (isAdminView) {
    manage = card('対応（担当者用）', `
      <div id="u-err" class="form-error" hidden></div>
      <form id="u-form" class="form-grid">
        <div class="field"><label>対応状況</label><select name="status">${options(c.statusOptions, c.status)}</select></div>
        <div class="field"><label>担当者</label><select name="assigneeUserId"><option value="">未割当</option>${options(c.staffOptions, c.assigneeUserId, 'id', (s) => `${s.name}（${s.roleLabel}）`)}</select></div>
        <div class="field full"><label>相談者への返信 / 対応記録</label><textarea name="response" placeholder="返信内容や対応記録を記入（返信希望の相談者に通知されます）"></textarea></div>
        <div class="field full"><button class="btn primary" type="submit">更新する</button></div>
      </form>`);
  }

  const html = `
    <a class="back-link" href="#/consultations">← 相談一覧へ戻る</a>
    ${card('相談内容', info)}
    ${card(isAdminView ? '対応記録・返信' : '教室からの返信', responses)}
    ${manage}`;

  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#u-form');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const errBox = root.querySelector('#u-err');
        try { await api.post('/api/consultations/' + c.id + '/update', { status: v.status, assigneeUserId: v.assigneeUserId, response: v.response }); toast('更新しました。'); ctx.reload(); }
        catch (err) { errBox.textContent = err.message; errBox.hidden = false; }
      });
    },
  };
}

// ==================================================================
// アプリ内メッセージ
// ==================================================================
function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 1_400_000) { reject(new Error('ファイルサイズは約1.4MBまでにしてください。')); return; }
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
    r.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
    r.readAsDataURL(file);
  });
}
function msgSafetyCallout() {
  return `<div class="callout">緊急のときはこの機能ではなく、<b>110番／119番</b>・保護者・教室へ直接ご連絡ください。<br><span class="muted small">対応時間：平日 13:00〜21:00　／　この会話は安全のため教室管理者が確認できます。</span></div>`;
}

export async function messages(ctx) {
  const data = await api.get('/api/threads');
  const rows = data.threads.length
    ? data.threads.map((t) => `<div class="thread-row${t.unread ? ' unread' : ''}" data-go="#/messages/${t.id}">
        <div class="tr-main">
          <div class="tr-title">${h(t.title)} ${t.type === 'group' ? '<span class="badge neutral">グループ</span>' : ''}${!t.member ? ' <span class="badge info">閲覧</span>' : ''}</div>
          <div class="tr-preview muted small">${t.lastMessage ? h(t.lastMessage.senderName) + '：' + h(t.lastMessage.text) : 'メッセージなし'}</div>
        </div>
        <div class="tr-meta">
          <div class="muted small">${t.lastMessage ? fmtDateTime(t.lastMessage.at) : ''}</div>
          ${t.unread ? `<span class="unread-badge">${t.unread}</span>` : ''}
        </div>
      </div>`).join('')
    : empty('メッセージはありません。');
  const html = `${msgSafetyCallout()}
    ${cardTight('メッセージ', `<div class="thread-list">${rows}</div>`, '<a class="btn sm primary" href="#/messages/new">新規メッセージ</a>')}`;
  return { html, mount: (root) => { root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.getAttribute('data-go'); })); } };
}

export async function messageNew(ctx) {
  const { contacts } = await api.get('/api/message-contacts');
  const groups = {};
  contacts.forEach((c) => { (groups[c.roleLabel] = groups[c.roleLabel] || []).push(c); });
  const groupHtml = Object.keys(groups).map((rl) => `<div class="section-label" style="margin-top:10px">${h(rl)}</div>
      <div class="contact-grid">${groups[rl].map((c) => `<label class="contact-item"><input type="checkbox" name="r" value="${h(c.id)}">${h(c.name)}</label>`).join('')}</div>`).join('');
  const html = `
    <a class="back-link" href="#/messages">← メッセージ一覧へ戻る</a>
    ${card('新規メッセージ', `
      <div id="err" class="form-error" hidden></div>
      <form id="m-form">
        <div class="field"><label>宛先（複数選ぶとグループになります）</label>${groupHtml || '<div class="muted small">送信できる相手がいません。</div>'}</div>
        <div class="field" style="margin-top:12px"><label>件名（グループのとき・任意）</label><input name="title" placeholder="例：〇〇についてのご連絡"></div>
        <div class="field" style="margin-top:12px"><label>本文</label><textarea name="body" placeholder="メッセージを入力"></textarea></div>
        <div class="field" style="margin-top:12px"><label>添付（画像・PDF／任意）</label><input type="file" id="m-file" accept="image/*,application/pdf"></div>
        <button class="btn primary" type="submit" style="margin-top:14px">送信</button>
      </form>`)}`;
  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#m-form');
      const err = root.querySelector('#err');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        const recips = [...form.querySelectorAll('input[name=r]:checked')].map((x) => x.value);
        const body = form.body.value.trim();
        const title = form.title.value.trim();
        if (!recips.length) { err.textContent = '宛先を選択してください。'; err.hidden = false; return; }
        let attachments = [];
        try { const a = await fileToAttachment(root.querySelector('#m-file').files[0]); if (a) attachments = [a]; }
        catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
        if (!body && !attachments.length) { err.textContent = '本文または添付を入力してください。'; err.hidden = false; return; }
        try { const r = await api.post('/api/threads', { recipientUserIds: recips, title, body, attachments }); toast('送信しました。'); location.hash = '#/messages/' + r.threadId; }
        catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
    },
  };
}

function renderMessage(m, t) {
  if (m.deleted) return `<div class="msg${m.mine ? ' mine' : ''}"><div class="msg-meta">${h(m.senderName)}</div><div class="msg-bubble deleted">削除済みのメッセージ</div></div>`;
  const atts = (m.attachments || []).map((a) => a.mime === 'application/pdf'
    ? `<a class="msg-att-pdf" href="${a.dataUrl}" download="${h(a.name)}">📄 ${h(a.name)}（PDF）</a>`
    : `<a href="${a.dataUrl}" download="${h(a.name)}"><img class="msg-att-img" src="${a.dataUrl}" alt="${h(a.name)}"></a>`).join('');
  const read = m.mine && m.readByOthers ? '<div class="msg-read">既読</div>' : '';
  const canDelete = m.mine || t.isAdminView;
  const actions = `<div class="msg-actions">
      ${!m.mine ? `<button class="btn sm" data-report="${m.id}">通報</button>` : ''}
      <button class="btn sm" data-fwd="${m.id}">相談へ転送</button>
      ${canDelete ? `<button class="btn sm" data-del="${m.id}">削除</button>` : ''}
    </div>`;
  return `<div class="msg${m.mine ? ' mine' : ''}">
      <div class="msg-meta">${h(m.senderName)} <span class="muted small">${fmtDateTime(m.createdAt)}</span> ${m.reported ? '<span class="badge danger">通報あり</span>' : ''}</div>
      <div class="msg-bubble">${m.body ? h(m.body).replace(/\n/g, '<br>') : ''}${atts ? `<div class="msg-atts">${atts}</div>` : ''}</div>
      ${read}
      ${actions}
    </div>`;
}

export async function messageThread(ctx) {
  const t = (await api.get('/api/threads/' + encodeURIComponent(ctx.params.id))).thread;
  if (t.member) api.post('/api/threads/' + t.id + '/read', {}).catch(() => {});
  const partNames = t.participants.map((p) => `${h(p.name)}<span class="muted small">（${h(p.roleLabel)}）</span>`).join('、');
  const bubbles = t.messages.length ? t.messages.map((m) => renderMessage(m, t)).join('') : '<div class="muted small" style="padding:8px">メッセージはありません。</div>';
  const composer = t.member
    ? `<form id="send-form" class="msg-composer">
        <textarea name="body" rows="2" placeholder="メッセージを入力"></textarea>
        <div class="row" style="margin-top:8px;align-items:center">
          <input type="file" id="c-file" accept="image/*,application/pdf" style="max-width:220px">
          <button class="btn primary" type="submit" style="margin-left:auto">送信</button>
        </div>
      </form>`
    : '<div class="callout">管理者として閲覧しています（監査）。返信するには「会話に追加」でご自身を参加させてください。</div>';

  const html = `
    <a class="back-link" href="#/messages">← メッセージ一覧へ戻る</a>
    ${card(t.title || 'メッセージ', `
      <div class="row between">
        <div class="muted small">参加者：${partNames}</div>
        <button class="btn sm" id="add-part">会話に追加</button>
      </div>
      <div id="add-part-box" hidden style="margin-top:10px"></div>`)}
    <section class="card"><div class="card-body"><div class="msg-list">${bubbles}</div></div></section>
    <section class="card"><div class="card-body">${composer}</div></section>`;

  return {
    html,
    mount: (root) => {
      const send = root.querySelector('#send-form');
      if (send) send.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = send.body.value.trim();
        let attachments = [];
        try { const a = await fileToAttachment(root.querySelector('#c-file').files[0]); if (a) attachments = [a]; }
        catch (ex) { toast(ex.message, true); return; }
        if (!body && !attachments.length) return;
        try { await api.post('/api/threads/' + t.id + '/messages', { body, attachments }); ctx.reload(); }
        catch (ex) { toast(ex.message, true); }
      });
      root.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', async () => {
        const reason = prompt('通報の理由（任意）を入力してください。'); if (reason === null) return;
        try { await api.post('/api/messages/' + b.getAttribute('data-report') + '/report', { reason }); toast('通報しました。教室管理者が確認します。'); ctx.reload(); }
        catch (ex) { toast(ex.message, true); }
      }));
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('このメッセージを削除しますか？（削除済みと表示され、内容は残ります）')) return;
        try { await api.post('/api/messages/' + b.getAttribute('data-del') + '/delete', {}); ctx.reload(); }
        catch (ex) { toast(ex.message, true); }
      }));
      root.querySelectorAll('[data-fwd]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('このメッセージを相談窓口へ転送しますか？')) return;
        try { await api.post('/api/messages/' + b.getAttribute('data-fwd') + '/forward-consultation', {}); toast('相談窓口へ転送しました。'); }
        catch (ex) { toast(ex.message, true); }
      }));
      const addBtn = root.querySelector('#add-part');
      const addBox = root.querySelector('#add-part-box');
      if (addBtn) addBtn.addEventListener('click', async () => {
        if (!addBox.hidden) { addBox.hidden = true; return; }
        const { contacts } = await api.get('/api/message-contacts');
        const current = new Set(t.participants.map((p) => p.id));
        const avail = contacts.filter((c) => !current.has(c.id));
        addBox.innerHTML = avail.length
          ? `<div class="row"><select id="add-sel">${options(avail, '', 'id', (c) => `${c.name}（${c.roleLabel}）`)}</select><button class="btn sm primary" id="add-do">追加</button></div>
             <div class="muted small" style="margin-top:6px">保護者や教室管理者を会話に追加できます。</div>`
          : '<div class="muted small">追加できる相手がいません。</div>';
        addBox.hidden = false;
        const doBtn = addBox.querySelector('#add-do');
        if (doBtn) doBtn.addEventListener('click', async () => {
          try { await api.post('/api/threads/' + t.id + '/participants', { userId: addBox.querySelector('#add-sel').value }); toast('会話に追加しました。'); ctx.reload(); }
          catch (ex) { toast(ex.message, true); }
        });
      });
    },
  };
}

// ==================================================================
// 質問・相談トップ（入口）
// ==================================================================
export async function hub(ctx) {
  const html = `
    <p class="muted small" style="margin:0 0 4px">知りたいことに合わせて選んでください。</p>
    <div class="grid-2">
      <a class="hub-card" href="#/questions">
        <div class="hub-icon">？</div>
        <div class="hub-title">勉強の質問</div>
        <div class="hub-desc muted">授業・宿題・学校の課題・参考書などで分からないところを、講師に質問できます。</div>
      </a>
      <a class="hub-card" href="#/consultations">
        <div class="hub-icon">！</div>
        <div class="hub-title">困りごとの相談</div>
        <div class="hub-desc muted">授業・講師・教室・人間関係・塾の運営などについて相談できます。内容は担当者だけが確認します。</div>
      </a>
    </div>`;
  return { html };
}

// ==================================================================
// 勉強の質問
// ==================================================================
const Q_STATUS_CLASS = { '回答待ち': 'warn', '講師確認中': 'info', '回答あり': 'ok', '追加確認中': 'warn', '解決済み': 'neutral' };
function qStatusBadge(s) { return `<span class="badge ${Q_STATUS_CLASS[s] || 'neutral'}">${h(s)}</span>`; }
function attHtml(atts) {
  if (!atts || !atts.length) return '';
  return `<div class="msg-atts">${atts.map((a) => a.mime === 'application/pdf'
    ? `<a class="msg-att-pdf" href="${a.dataUrl}" download="${h(a.name)}">📄 ${h(a.name)}（PDF）</a>`
    : `<a href="${a.dataUrl}" download="${h(a.name)}"><img class="msg-att-img" src="${a.dataUrl}" alt="${h(a.name)}"></a>`).join('')}</div>`;
}
function bindGo(root) { root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.getAttribute('data-go'); })); }
const qGuide = '<div class="callout">分からない問題を質問できます。生活上の悩みや教室への相談は「困りごとの相談」からお願いします。</div>';

export async function questions(ctx) {
  const data = await api.get('/api/questions');
  if (data.isAdmin) return adminQuestions(data);
  if (data.role === 'teacher') return teacherQuestions(data);
  return studentQuestions(data);
}

function tabbedTable(headHtml, tabNames, groupsFn, rowFn, cols) {
  const tabHtml = tabNames.map((s, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-f="${h(s)}">${h(s)}<span class="count">${(groupsFn(s) || []).length}</span></button>`).join('');
  const html = `<section class="card">
      <div class="card-head"><h3>勉強の質問</h3>${headHtml || ''}</div>
      <div class="tabs" id="q-tabs">${tabHtml}</div>
      <div class="card-body tight"><div class="table-wrap"><table class="tbl"><thead><tr>${cols}</tr></thead><tbody id="q-body"></tbody></table></div></div>
    </section>`;
  const colspan = (cols.match(/<th/g) || []).length;
  function render(root, f) {
    const list = groupsFn(f) || [];
    const b = root.querySelector('#q-body');
    b.innerHTML = list.length ? list.map(rowFn).join('') : `<tr><td colspan="${colspan}" class="muted" style="padding:20px">該当する質問はありません。</td></tr>`;
    bindGo(b);
  }
  return {
    html,
    mount: (root) => {
      render(root, tabNames[0]);
      root.querySelectorAll('#q-tabs .tab').forEach((t) => t.addEventListener('click', () => {
        root.querySelectorAll('#q-tabs .tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active'); render(root, t.getAttribute('data-f'));
      }));
    },
  };
}

function studentQuestions(data) {
  const isStudent = data.role === 'student';
  const rowFn = (q) => `<tr class="clickable" data-go="#/questions/${q.id}"><td>${h(q.subject)}</td><td>${h(q.title)} ${q.unread ? '<span class="unread-badge">' + q.unread + '</span>' : ''}</td><td>${fmtDateTime(q.createdAt)}</td><td>${q.assignedTeacherName ? h(q.assignedTeacherName) : '<span class="muted">未定</span>'}</td><td>${qStatusBadge(q.status)}</td></tr>`;
  const tabNames = ['すべて', ...data.statuses];
  const groupsFn = (f) => (f === 'すべて' ? data.questions : data.questions.filter((q) => q.status === f));
  const head = isStudent ? '<a class="btn sm primary" href="#/questions/new">質問する</a>' : '';
  const built = tabbedTable(head, tabNames, groupsFn, rowFn, '<th>教科</th><th>タイトル</th><th>投稿日時</th><th>担当講師</th><th>状態</th>');
  return { html: `${qGuide}${built.html}`, mount: built.mount };
}

function teacherQuestions(data) {
  const qs = data.questions;
  const groups = {
    '対応可能': qs.filter((q) => q.claimable),
    '担当中': qs.filter((q) => q.mine && q.status !== '解決済み'),
    '追加質問': qs.filter((q) => q.mine && q.status === '追加確認中'),
    '解決済み': qs.filter((q) => q.mine && q.status === '解決済み'),
  };
  const rowFn = (q) => `<tr class="clickable" data-go="#/questions/${q.id}"><td>${h(q.subject)}</td><td>${h(q.title)} ${q.unread ? '<span class="unread-badge">' + q.unread + '</span>' : ''}</td><td>${h(q.studentName || '')}</td><td>${fmtDateTime(q.createdAt)}</td><td>${qStatusBadge(q.status)}</td></tr>`;
  const built = tabbedTable('', Object.keys(groups), (f) => groups[f], rowFn, '<th>教科</th><th>タイトル</th><th>生徒</th><th>投稿日時</th><th>状態</th>');
  return built;
}

function adminQuestions(data) {
  const filters = `<form id="qfilter" class="filters">
      <div class="field"><label>状態</label><select name="status"><option value="">すべて</option>${options(data.statuses, '')}</select></div>
      <div class="field"><label>教科</label><select name="subject"><option value="">すべて</option>${options(data.subjects, '')}</select></div>
      <div class="field"><label>担当講師</label><select name="teacher"><option value="">すべて</option>${options(data.teachers || [], '', 'id', (t) => t.name)}</select></div>
      <button class="btn" type="submit">絞り込む</button></form>`;
  const rowFn = (q) => `<tr class="clickable" data-go="#/questions/${q.id}"><td>${h(q.number)}</td><td>${h(q.subject)}</td><td>${h(q.title)}</td><td>${h(q.studentName || '')}</td><td>${q.assignedTeacherName ? h(q.assignedTeacherName) : '<span class="muted">未定</span>'}</td><td>${qStatusBadge(q.status)}</td><td>${fmtDateTime(q.updatedAt)}</td></tr>`;
  async function load(root, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const d = await api.get('/api/questions' + (qs ? '?' + qs : ''));
    const b = root.querySelector('#q-body');
    b.innerHTML = d.questions.length ? d.questions.map(rowFn).join('') : '<tr><td colspan="7" class="muted" style="padding:20px">該当する質問はありません。</td></tr>';
    bindGo(b);
  }
  const html = `${card('絞り込み', filters)}
    ${cardTight('質問管理', '<div class="table-wrap"><table class="tbl"><thead><tr><th>番号</th><th>教科</th><th>タイトル</th><th>投稿者</th><th>担当</th><th>状態</th><th>最終更新</th></tr></thead><tbody id="q-body"></tbody></table></div>')}`;
  return { html, mount: (root) => { load(root, {}); const f = root.querySelector('#qfilter'); f.addEventListener('submit', (e) => { e.preventDefault(); load(root, formValues(f)); }); } };
}

export async function questionNew(ctx) {
  const data = await api.get('/api/questions');
  const subjects = data.subjects || [];
  const teachers = data.teachers || [];
  const html = `
    <a class="back-link" href="#/questions">← 質問一覧へ戻る</a>
    ${qGuide}
    ${card('質問する', `
      <div id="err" class="form-error" hidden></div>
      <form id="q-form" class="form-grid">
        <div class="field"><label>教科 <span class="req">*</span></label><select name="subject" required><option value="">選択してください</option>${options(subjects, '')}</select></div>
        <div class="field"><label>単元</label><input name="unit" placeholder="例：一次関数"></div>
        <div class="field full"><label>タイトル</label><input name="title" placeholder="例：グラフの傾きが分かりません"></div>
        <div class="field full"><label>質問内容 <span class="req">*</span>（文章または画像）</label><textarea name="body" placeholder="分からないところを書いてください"></textarea></div>
        <div class="field full"><label>問題の画像・PDF</label><input type="file" id="q-file" accept="image/*,application/pdf"></div>
        <div class="field"><label>教材名</label><input name="material"></div>
        <div class="field"><label>ページ / 問題番号</label><div class="row" style="gap:8px"><input name="page" placeholder="ページ" style="max-width:110px"><input name="problemNo" placeholder="問題番号"></div></div>
        <div class="field full"><label>自分がどこまで考えたか</label><textarea name="attempted"></textarea></div>
        <div class="field full"><label>どこから分からなくなったか</label><textarea name="stuckPoint"></textarea></div>
        <div class="field"><label>回答希望期限</label><input type="date" name="dueAt"></div>
        <div class="field"><label>送り先</label>
          <label style="font-weight:400;display:block;margin-top:6px"><input type="radio" name="routing" value="open" checked style="width:auto;margin-right:6px">対応可能な講師に質問する</label>
          <label style="font-weight:400;display:block"><input type="radio" name="routing" value="assigned" style="width:auto;margin-right:6px">担当講師に質問する</label>
          <select name="assignedTeacherId" id="q-teacher" style="margin-top:6px;display:none"><option value="">講師を選択</option>${options(teachers, '', 'id', (t) => `${t.name}（${(t.subjects || []).join('・')}）`)}</select>
        </div>
        <div class="field full"><button class="btn primary" type="submit">質問を送信</button></div>
      </form>`)}`;
  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#q-form');
      const err = root.querySelector('#err');
      const tsel = root.querySelector('#q-teacher');
      form.querySelectorAll('input[name=routing]').forEach((r) => r.addEventListener('change', () => { tsel.style.display = form.routing.value === 'assigned' ? 'block' : 'none'; }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); err.hidden = true;
        const v = formValues(form);
        let attachments = [];
        try { const a = await fileToAttachment(root.querySelector('#q-file').files[0]); if (a) attachments = [a]; }
        catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
        if (!v.subject) { err.textContent = '教科を選択してください。'; err.hidden = false; return; }
        if (!v.body && !attachments.length) { err.textContent = '質問内容（文章）または画像を入力してください。'; err.hidden = false; return; }
        const payload = { subject: v.subject, unit: v.unit, title: v.title, body: v.body, material: v.material, page: v.page, problemNo: v.problemNo, attempted: v.attempted, stuckPoint: v.stuckPoint, dueAt: v.dueAt, routing: form.routing.value, assignedTeacherId: v.assignedTeacherId, attachments };
        try { const r = await api.post('/api/questions', payload); toast('質問を送信しました。'); location.hash = '#/questions/' + r.id; }
        catch (ex) { err.textContent = ex.message; err.hidden = false; }
      });
    },
  };
}

function renderQMsg(m) {
  const label = m.kind === 'answer' ? '回答' : (m.kind === 'followup' ? '追加の質問' : '');
  const inner = m.deleted ? '<span class="muted">削除されました</span>' : (h(m.body).replace(/\n/g, '<br>') + attHtml(m.attachments));
  return `<div class="msg${m.mine ? ' mine' : ''}"><div class="msg-meta">${h(m.senderName)}${label ? ' ・ ' + label : ''} <span class="muted small">${fmtDateTime(m.createdAt)}</span></div><div class="msg-bubble">${inner}</div></div>`;
}

export async function questionDetail(ctx) {
  const q = (await api.get('/api/questions/' + encodeURIComponent(ctx.params.id))).question;
  const info = `<dl class="kv">
      <dt>番号</dt><dd>${h(q.number)}</dd>
      <dt>教科</dt><dd>${h(q.subject)}${q.unit ? ' ／ ' + h(q.unit) : ''}</dd>
      <dt>いまの状況</dt><dd>${qStatusBadge(q.status)}</dd>
      <dt>担当講師</dt><dd>${q.assignedTeacherName ? h(q.assignedTeacherName) : '<span class="muted">未定（対応可能な講師へ）</span>'}</dd>
      ${q.isAdminView ? `<dt>質問した生徒</dt><dd>${h(q.studentName)} <span class="muted small">${h(q.studentGrade || '')}</span></dd>` : ''}
      ${q.material ? `<dt>教材</dt><dd>${h(q.material)} ${q.page ? 'p.' + h(q.page) : ''} ${h(q.problemNo || '')}</dd>` : ''}
      ${q.dueAt ? `<dt>回答希望</dt><dd>${fmtDate(q.dueAt)}</dd>` : ''}
      <dt>投稿日時</dt><dd>${fmtDateTime(q.createdAt)}</dd>
    </dl>
    <div class="section-label" style="margin-top:12px">質問内容</div>
    <div style="white-space:pre-wrap">${q.body ? h(q.body) : '<span class="muted">（本文なし）</span>'}</div>
    ${q.attempted ? `<div class="section-label" style="margin-top:10px">考えたこと</div><div style="white-space:pre-wrap">${h(q.attempted)}</div>` : ''}
    ${q.stuckPoint ? `<div class="section-label" style="margin-top:10px">分からなくなったところ</div><div style="white-space:pre-wrap">${h(q.stuckPoint)}</div>` : ''}
    ${q.attachments && q.attachments.length ? `<div class="section-label" style="margin-top:10px">添付</div>${attHtml(q.attachments)}` : ''}`;
  const thread = q.messages.length ? `<div class="msg-list">${q.messages.map(renderQMsg).join('')}</div>` : '<div class="muted small">まだ回答はありません。</div>';

  let composer = '';
  if (q.canClaim) composer = '<button class="btn primary" id="claim-btn">この質問に対応する</button><p class="muted small" style="margin-top:8px">対応可能な講師に表示されています。担当すると、あなたが回答者になります。</p>';
  else if (q.canAnswer || q.canFollowup) composer = `<div class="callout" style="margin-bottom:10px">この画面は勉強に関する質問のためのものです。生活上の悩みや教室への相談は「困りごとの相談」から送信してください。</div>
      <form id="q-send"><textarea name="body" rows="2" placeholder="${q.canAnswer ? '回答を入力' : '追加の質問を入力'}"></textarea>
        <div class="row" style="margin-top:8px;align-items:center"><input type="file" id="q-file" accept="image/*,application/pdf" style="max-width:220px"><button class="btn primary" type="submit" style="margin-left:auto">${q.canAnswer ? '回答する' : '追加で質問する'}</button></div></form>`;
  else if (q.isAdminView) composer = '<div class="muted small">管理者として閲覧しています。</div>';

  const resolveBtn = q.canResolve ? '<button class="btn" id="resolve-btn">解決済みにする</button>' : '';
  const html = `
    <a class="back-link" href="#/questions">← 質問一覧へ戻る</a>
    ${card(q.title || '質問', info, resolveBtn)}
    ${card('やり取り', thread)}
    ${composer ? `<section class="card"><div class="card-body">${composer}</div></section>` : ''}`;

  return {
    html,
    mount: (root) => {
      const claim = root.querySelector('#claim-btn');
      if (claim) claim.addEventListener('click', async () => { try { await api.post('/api/questions/' + q.id + '/claim', {}); toast('この質問を担当します。'); ctx.reload(); } catch (ex) { toast(ex.message, true); } });
      const resolve = root.querySelector('#resolve-btn');
      if (resolve) resolve.addEventListener('click', async () => { if (!confirm('この質問を解決済みにしますか？')) return; try { await api.post('/api/questions/' + q.id + '/resolve', {}); toast('解決済みにしました。'); ctx.reload(); } catch (ex) { toast(ex.message, true); } });
      const send = root.querySelector('#q-send');
      if (send) send.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = send.body.value.trim();
        let attachments = [];
        try { const a = await fileToAttachment(root.querySelector('#q-file').files[0]); if (a) attachments = [a]; }
        catch (ex) { toast(ex.message, true); return; }
        if (!body && !attachments.length) return;
        try { await api.post('/api/questions/' + q.id + '/messages', { body, attachments }); ctx.reload(); }
        catch (ex) { toast(ex.message, true); }
      });
    },
  };
}

// ==================================================================
// 通知の受信箱
// ==================================================================
export async function notifications(ctx) {
  const data = await api.get('/api/notifications');
  const items = data.notifications.length
    ? data.notifications.map((n) => `<div class="notice-item" style="display:flex;justify-content:space-between;gap:12px;align-items:center">
        <div><div class="t" style="font-weight:${n.read ? '400' : '600'}">${n.read ? '' : '<span class="badge info" style="margin-right:6px">未読</span>'}${h(n.text)}</div>
        <div class="d">${fmtDateTime(n.createdAt)}</div></div>
        <a class="btn sm" href="${h(n.href)}" data-nid="${h(n.id)}">開く</a></div>`).join('')
    : empty('通知はありません。');
  const head = data.notifications.some((n) => !n.read) ? '<button class="btn sm" id="read-all">すべて既読にする</button>' : '';
  return {
    html: cardTight('通知', items, head),
    mount: (root) => {
      root.querySelectorAll('[data-nid]').forEach((a) => a.addEventListener('click', () => { api.post('/api/notifications/read', { id: a.getAttribute('data-nid') }).catch(() => {}); }));
      const ra = root.querySelector('#read-all'); if (ra) ra.addEventListener('click', async () => { await api.post('/api/notifications/read', {}); ctx.reload(); });
    },
  };
}

// ==================================================================
// 時間割カレンダー（生徒・保護者）: 週表示のグリッド
// ==================================================================
// 科目ごとの識別色（左ボーダーに使用。落ち着いたトーンで区別できる程度に）
const SUBJECT_COLORS = {
  '英語': '#2f6db3', '数学': '#1f7a44', '国語': '#b3261e', '理科': '#7a52c0',
  '社会': '#b5751a', '物理': '#0f766e', '化学': '#a23a86',
};
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function ymd(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function mondayOf(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();               // 0=日
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));  // 週の起点を月曜に
  return d;
}

export async function timetable(ctx) {
  const [lessonsRes, meta, recRes] = await Promise.all([
    api.get('/api/lessons'), api.get('/api/meta'), api.get('/api/lesson-records'),
  ]);
  const lessons = lessonsRes.lessons || [];
  const records = (recRes.records || []).slice()
    .sort((a, b) => (a.date === b.date ? b.period - a.period : (a.date < b.date ? 1 : -1))); // 新しい順
  const periods = meta.periods || { 1: ['16:00', '17:20'], 2: ['17:30', '18:50'], 3: ['19:00', '20:20'], 4: ['20:30', '21:50'] };
  const periodNums = Object.keys(periods).map(Number).sort((a, b) => a - b);
  const todayYmd = ymd(new Date());

  // 授業を「日付#時限」で索引化（同一コマに複数授業があっても表示できるよう配列で保持）
  const byKey = {};
  lessons.forEach((l) => { const k = l.date + '#' + l.period; (byKey[k] || (byKey[k] = [])).push(l); });
  const lessonById = {};
  lessons.forEach((l) => { lessonById[l.id] = l; });

  let offset = 0; // 今週=0。前週/翌週で増減。

  function weekDates(off) {
    const start = mondayOf(new Date());
    start.setDate(start.getDate() + off * 7);
    return [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }
  function rangeLabel(off) { const w = weekDates(off); return `${fmtDate(ymd(w[0]))} 〜 ${fmtDate(ymd(w[6]))}`; }

  function lessonHtml(l) {
    const past = l.date < todayYmd;
    const color = SUBJECT_COLORS[l.subject] || 'var(--muted)';
    // 他家庭の生徒名は表示しない（プライバシー保護）。科目・担当・教室のみ。
    // ボタン化して、タップで「この日までの宿題・前回までの進度」を表示する。
    return `<button type="button" class="tt-lesson${past ? ' past' : ''}" data-lid="${h(l.id)}" style="border-left-color:${color}">
      <span class="s">${h(l.subject)}</span>
      <span class="m">${h(l.teacherName)}</span>
      <span class="m">${h(l.roomName)}</span>
    </button>`;
  }

  function gridHtml(off) {
    const dates = weekDates(off);
    const ymds = dates.map(ymd);
    const weekHasLesson = ymds.some((y) => periodNums.some((p) => (byKey[y + '#' + p] || []).length));

    const head = `<tr><th class="tt-corner">時限</th>${dates.map((d) => {
      const y = ymd(d); const today = y === todayYmd;
      return `<th class="tt-day-head${today ? ' today' : ''}"><span class="wd">${WEEKDAYS[d.getDay()]}</span><span class="dt">${d.getMonth() + 1}/${d.getDate()}</span>${today ? '<span class="tt-todaytag">本日</span>' : ''}</th>`;
    }).join('')}</tr>`;

    const rows = periodNums.map((p) => {
      const [st, en] = periods[p];
      const cells = ymds.map((y) => {
        const today = y === todayYmd;
        const items = byKey[y + '#' + p] || [];
        return `<td class="tt-cell${today ? ' today' : ''}">${items.map(lessonHtml).join('')}</td>`;
      }).join('');
      return `<tr><th class="tt-th-period"><b>${p}限</b><span>${h(st)}–${h(en)}</span></th>${cells}</tr>`;
    }).join('');

    return `<div class="table-wrap"><table class="tt-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      ${weekHasLesson ? '' : '<p class="muted small" style="padding:14px 16px;margin:0">この週に予定されている授業はありません。</p>'}`;
  }

  // コマをタップしたときの詳細（この日までにやってくる宿題／前回までの進度）
  function detailHtml(l) {
    // 同じ科目で、その授業日より前の記録を新しい順に集める
    const prior = records.filter((r) => r.subject === l.subject && r.date < l.date);
    const last = prior[0];

    let hwHtml;
    if (!last) {
      hwHtml = '<p class="muted small" style="margin:0">この科目のこれまでの授業記録がまだないため、宿題はありません。</p>';
    } else if (last.homework && last.homework.trim()) {
      hwHtml = `<div class="tt-hw">${h(last.homework)}</div>
        <p class="muted small" style="margin:6px 0 0"><a href="#/records/${h(last.id)}">${fmtDate(last.date)} ${periodLabel(last.period)}の授業で出題 →</a></p>`;
    } else {
      hwHtml = `<p class="muted small" style="margin:0">前回（${fmtDate(last.date)} ${periodLabel(last.period)}）の授業では宿題は出ていません。</p>`;
    }

    const progs = prior.filter((r) => r.progress && r.progress.trim()).slice(0, 4);
    let progHtml;
    if (!progs.length) {
      progHtml = '<p class="muted small" style="margin:0">これまでの進度の記録はまだありません。</p>';
    } else {
      progHtml = `<ul class="tt-prog">${progs.map((r) => `<li>
        <div class="d">${fmtDate(r.date)} ${periodLabel(r.period)}・${h(r.teacherName)}</div>
        <div class="p">${h(r.progress)}</div>
        ${r.checkNext && r.checkNext.trim() ? `<div class="c">確認事項：${h(r.checkNext)}</div>` : ''}
        <a class="lnk" href="#/records/${h(r.id)}">この記録を開く →</a>
      </li>`).join('')}</ul>`;
    }

    const color = SUBJECT_COLORS[l.subject] || 'var(--muted)';
    return `
      <div class="tt-modal-title"><span class="tt-dot" style="background:${color}"></span>${fmtDate(l.date)} ${periodLabel(l.period)}　${h(l.subject)}</div>
      <div class="muted small" style="margin-top:2px">${h(l.teacherName)}／${h(l.roomName)}（${h(l.start)}–${h(l.end)}）</div>
      <div class="section-label" style="margin-top:16px">この日までにやってくる宿題</div>
      ${hwHtml}
      <div class="section-label" style="margin-top:18px">前回までの進度</div>
      ${progHtml}`;
  }

  const html = `
    <p class="muted small" style="margin:0 0 12px">受講予定の授業を週ごとに表示します。授業をタップすると、その日までの宿題と前回までの進度を確認できます。</p>
    <section class="card">
      <div class="card-head tt-head">
        <div class="tt-nav">
          <button class="btn sm" id="tt-prev">‹ 前の週</button>
          <button class="btn sm" id="tt-today">今週</button>
          <button class="btn sm" id="tt-next">次の週 ›</button>
        </div>
        <h3 id="tt-range" style="font-variant-numeric:tabular-nums">${h(rangeLabel(0))}</h3>
      </div>
      <div class="card-body tight" id="tt-grid"></div>
    </section>
    <div class="tt-modal" id="tt-modal" hidden>
      <div class="tt-modal-backdrop" data-close></div>
      <div class="tt-modal-panel" role="dialog" aria-modal="true" aria-label="授業の詳細">
        <button type="button" class="tt-modal-close" data-close aria-label="閉じる">×</button>
        <div class="tt-modal-body" id="tt-modal-body"></div>
      </div>
    </div>`;

  return {
    html,
    mount: (root) => {
      const grid = root.querySelector('#tt-grid');
      const label = root.querySelector('#tt-range');
      const btnToday = root.querySelector('#tt-today');
      const modal = root.querySelector('#tt-modal');
      const modalBody = root.querySelector('#tt-modal-body');

      const closeModal = () => { modal.hidden = true; document.removeEventListener('keydown', onKey); };
      function onKey(e) { if (e.key === 'Escape') closeModal(); }
      const openModal = (lid) => {
        const l = lessonById[lid];
        if (!l) return;
        modalBody.innerHTML = detailHtml(l);
        modal.hidden = false;
        document.addEventListener('keydown', onKey);
      };

      const rerender = () => {
        grid.innerHTML = gridHtml(offset);
        label.textContent = rangeLabel(offset);
        btnToday.classList.toggle('primary', offset === 0);
        btnToday.disabled = offset === 0;
      };

      // コマのクリックはイベント委譲（週切替で中身が入れ替わっても機能する）
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lid]');
        if (btn) openModal(btn.getAttribute('data-lid'));
      });
      // モーダルを閉じる（背景・×・記録リンクの遷移時）
      modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]') || e.target.closest('a[href^="#/records/"]')) closeModal();
      });

      root.querySelector('#tt-prev').addEventListener('click', () => { offset -= 1; rerender(); });
      root.querySelector('#tt-next').addEventListener('click', () => { offset += 1; rerender(); });
      btnToday.addEventListener('click', () => { offset = 0; rerender(); });
      rerender();
    },
  };
}

// ==================================================================
// 補習予約（振替）: フェーズ3
// 先生・教室が「補習可能枠」を登録し、生徒・保護者が空き枠から即時予約する。
// ==================================================================
export async function supplementary(ctx) {
  const staff = ctx.user.role === 'teacher' || ctx.user.role === 'classroom_admin' || ctx.user.role === 'system_admin';
  return staff ? supplementaryStaff(ctx) : supplementaryFamily(ctx);
}

// --- 生徒・保護者：空き枠を探して予約する（ホットペッパー式） ---
async function supplementaryFamily(ctx) {
  const html = `
    <p class="muted small" style="margin:0 0 12px">補習（振替）の空き枠から、担当の先生と日時を選んで予約できます。予約はすぐに確定します。</p>
    ${cardTight('現在の予約', '<div id="sup-bk"><div class="empty">読み込み中…</div></div>')}
    <section class="card">
      <div class="card-head"><h3>空き枠を探す</h3><span class="muted small" id="sup-count"></span></div>
      <div class="card-body">
        <form id="sup-filters" class="filters">
          <div class="field" id="sup-childf" hidden><label>生徒</label><select name="studentId"></select></div>
          <div class="field"><label>科目</label><select name="subject"><option value="">すべて</option></select></div>
          <div class="field"><label>担当の先生</label><select name="teacher"><option value="">指定なし</option></select></div>
        </form>
      </div>
      <div class="card-body tight" id="sup-slots"><div class="empty">読み込み中…</div></div>
    </section>
    <div class="tt-modal" id="sup-modal" hidden>
      <div class="tt-modal-backdrop" data-close></div>
      <div class="tt-modal-panel" role="dialog" aria-modal="true" aria-label="補習の予約">
        <button type="button" class="tt-modal-close" data-close aria-label="閉じる">×</button>
        <div id="sup-modal-body"></div>
      </div>
    </div>`;

  return {
    html,
    mount: (root) => {
      const slotsEl = root.querySelector('#sup-slots');
      const bkEl = root.querySelector('#sup-bk');
      const countEl = root.querySelector('#sup-count');
      const form = root.querySelector('#sup-filters');
      const childF = root.querySelector('#sup-childf');
      const modal = root.querySelector('#sup-modal');
      const modalBody = root.querySelector('#sup-modal-body');
      let slotMap = {};
      let students = [];
      let curStudentId = null;

      const closeModal = () => { modal.hidden = true; document.removeEventListener('keydown', onKey); };
      function onKey(e) { if (e.key === 'Escape') closeModal(); }

      function renderSlots(list) {
        countEl.textContent = list.length ? `${list.length} 件の空き枠` : '';
        if (!list.length) { slotsEl.innerHTML = empty('条件に合う空き枠はありません。先生が枠を追加すると表示されます。'); return; }
        const byDate = {};
        list.forEach((s) => { (byDate[s.date] || (byDate[s.date] = [])).push(s); });
        slotsEl.innerHTML = Object.keys(byDate).sort().map((date) => `
          <div class="sup-day">
            <div class="sup-day-hd">${fmtDate(date)}</div>
            ${byDate[date].map((s) => `
              <div class="sup-slot">
                <div class="sup-slot-info">
                  <span class="sup-slot-time">${periodLabel(s.period)} <span class="muted">${h(s.start)}–${h(s.end)}</span></span>
                  <span class="sup-slot-teacher">${h(s.teacherName)} 先生</span>
                  <span class="sup-slot-subs">${s.subjects.map((x) => `<span class="chip">${h(x)}</span>`).join('')}</span>
                  ${s.note ? `<span class="muted small">${h(s.note)}</span>` : ''}
                </div>
                <button class="btn sm primary" data-book="${h(s.id)}">予約する</button>
              </div>`).join('')}
          </div>`).join('');
      }

      function renderBookings(list) {
        const guardian = ctx.user.role === 'guardian';
        const upcoming = list.filter((b) => b.status === 'confirmed');
        const done = list.filter((b) => b.status !== 'confirmed');
        const item = (b) => `
          <div class="sup-bk-item">
            <div>
              <div class="sup-bk-when"><b>${fmtDate(b.date)} ${periodLabel(b.period)}</b> <span class="muted">${h(b.start)}–${h(b.end)}</span></div>
              <div class="small">${h(b.subject)}・${h(b.teacherName)} 先生${guardian ? `・${h(b.studentName)}` : ''}</div>
              ${b.note ? `<div class="muted small">メモ：${h(b.note)}</div>` : ''}
            </div>
            <button class="btn sm" data-cancel="${h(b.id)}">キャンセル</button>
          </div>`;
        let out = upcoming.length ? upcoming.map(item).join('') : empty('予約はありません。下の空き枠から予約できます。');
        if (done.length) out += `<div class="section-label" style="padding:12px 16px 4px">過去・キャンセル</div>${done.map((b) => `<div class="sup-bk-item"><div class="small muted">${fmtDate(b.date)} ${periodLabel(b.period)}・${h(b.subject)}・${h(b.teacherName)} 先生</div><span class="badge neutral">${b.status === 'cancelled' ? 'キャンセル済' : '終了'}</span></div>`).join('')}`;
        bkEl.innerHTML = out;
        bkEl.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
          if (!window.confirm('この補習予約をキャンセルしますか？')) return;
          try { await api.post('/api/supplementary/bookings/' + btn.getAttribute('data-cancel') + '/cancel', {}); toast('予約をキャンセルしました。'); await reloadAll(); }
          catch (e) { toast(e.message, true); }
        }));
      }

      async function loadSlots() {
        const v = formValues(form);
        curStudentId = v.studentId || curStudentId || (students[0] && students[0].id);
        const qs = new URLSearchParams();
        if (curStudentId) qs.set('studentId', curStudentId);
        if (v.subject) qs.set('subject', v.subject);
        if (v.teacher) qs.set('teacher', v.teacher);
        const data = await api.get('/api/supplementary/slots?' + qs.toString());
        slotMap = {}; (data.slots || []).forEach((s) => { slotMap[s.id] = s; });
        renderSlots(data.slots || []);
      }

      async function initFilters() {
        const data = await api.get('/api/supplementary/slots');
        students = data.students || [];
        curStudentId = data.targetStudentId || (students[0] && students[0].id);
        if (students.length > 1) {
          childF.hidden = false;
          form.studentId.innerHTML = students.map((s) => `<option value="${h(s.id)}"${s.id === curStudentId ? ' selected' : ''}>${h(s.name)}（${h(s.grade)}）</option>`).join('');
        }
        form.subject.innerHTML = '<option value="">すべて</option>' + (data.subjects || []).map((x) => `<option value="${h(x)}">${h(x)}</option>`).join('');
        form.teacher.innerHTML = '<option value="">指定なし</option>' + (data.teachers || []).map((t) => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('');
      }

      async function reloadAll() {
        const [, bk] = await Promise.all([loadSlots(), api.get('/api/supplementary/bookings')]);
        renderBookings(bk.bookings || []);
      }

      function openBook(slotId) {
        const s = slotMap[slotId];
        if (!s) return;
        const v = formValues(form);
        const subs = s.subjects;
        const preferred = (v.subject && subs.includes(v.subject)) ? v.subject : subs[0];
        const child = students.find((x) => x.id === curStudentId);
        modalBody.innerHTML = `
          <div class="tt-modal-title">補習の予約</div>
          <dl class="kv" style="margin-top:12px">
            <dt>日時</dt><dd>${fmtDate(s.date)} ${periodLabel(s.period)}（${h(s.start)}–${h(s.end)}）</dd>
            <dt>担当</dt><dd>${h(s.teacherName)} 先生</dd>
            ${child ? `<dt>生徒</dt><dd>${h(child.name)}（${h(child.grade)}）</dd>` : ''}
          </dl>
          <div id="sup-book-err" class="form-error" hidden style="margin-top:12px"></div>
          <div class="field" style="margin-top:12px"><label>科目 <span class="req">*</span></label>
            <select id="sup-book-subject">${subs.map((x) => `<option value="${h(x)}"${x === preferred ? ' selected' : ''}>${h(x)}</option>`).join('')}</select></div>
          <div class="field" style="margin-top:12px"><label>先生への連絡（任意）</label>
            <textarea id="sup-book-note" placeholder="お願いしたい内容など（欠席分の振替、質問したい単元 など）"></textarea></div>
          <button class="btn primary" id="sup-book-do" style="margin-top:14px;width:100%">この内容で予約する</button>`;
        modal.hidden = false;
        document.addEventListener('keydown', onKey);
        modalBody.querySelector('#sup-book-do').addEventListener('click', async () => {
          const errBox = modalBody.querySelector('#sup-book-err');
          const payload = { slotId: s.id, studentId: curStudentId, subject: modalBody.querySelector('#sup-book-subject').value, note: modalBody.querySelector('#sup-book-note').value.trim() };
          try { await api.post('/api/supplementary/bookings', payload); closeModal(); toast('補習を予約しました。'); await reloadAll(); }
          catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
        });
      }

      slotsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-book]'); if (b) openBook(b.getAttribute('data-book')); });
      modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
      form.addEventListener('change', () => { loadSlots().catch((e) => toast(e.message, true)); });

      (async () => {
        try { await initFilters(); await reloadAll(); }
        catch (e) { slotsEl.innerHTML = `<div class="form-error" style="margin:12px">${h(e.message || '読み込みに失敗しました。')}</div>`; }
      })();
    },
  };
}

// --- 先生・教室：補習可能枠の登録・管理 ---
async function supplementaryStaff(ctx) {
  const html = `
    <p class="muted small" style="margin:0 0 12px">生徒・保護者が予約できる「補習可能枠」を登録します。登録した枠は生徒側の予約画面にすぐ表示され、予約が入ると通知されます。</p>
    <section class="card">
      <div class="card-head"><h3>補習可能枠を登録</h3></div>
      <div class="card-body">
        <div id="sup-err" class="form-error" hidden></div>
        <form id="sup-form" class="form-grid">
          <div class="field" id="sup-teacherf"><label>担当講師 <span class="req">*</span></label><select name="teacherId"></select></div>
          <div class="field"><label>日付 <span class="req">*</span></label><input type="date" name="date"></div>
          <div class="field"><label>時限 <span class="req">*</span></label><select name="period"></select></div>
          <div class="field"><label>定員</label><input type="number" name="capacity" value="1" min="1" max="6"></div>
          <div class="field full"><label>対応科目（未選択なら担当科目すべて）</label><div class="sup-chks" id="sup-subs"></div></div>
          <div class="field full"><label>メモ（任意）</label><input name="note" placeholder="持ち物・内容など（例：欠席分の振替に対応します）"></div>
          <div class="field full"><button class="btn primary" type="submit">枠を登録</button></div>
        </form>
      </div>
    </section>
    ${cardTight('登録済みの枠（今後）', '<div id="sup-manage"><div class="empty">読み込み中…</div></div>')}`;

  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#sup-form');
      const errBox = root.querySelector('#sup-err');
      const teacherF = root.querySelector('#sup-teacherf');
      const subsEl = root.querySelector('#sup-subs');
      const manageEl = root.querySelector('#sup-manage');
      let teacherOptions = [];
      const todayS = new Date().toISOString().slice(0, 10);

      function selectedTeacher() {
        const tid = form.teacherId ? form.teacherId.value : (teacherOptions[0] && teacherOptions[0].id);
        return teacherOptions.find((x) => x.id === tid) || teacherOptions[0];
      }
      function renderSubjects() {
        const t = selectedTeacher();
        const subs = (t && t.subjects) || [];
        subsEl.innerHTML = subs.length ? subs.map((s) => `<label class="sup-chk"><input type="checkbox" value="${h(s)}"> ${h(s)}</label>`).join('') : '<span class="muted small">担当科目が設定されていません。</span>';
      }

      function renderManage(slots) {
        if (!slots.length) { manageEl.innerHTML = empty('登録済みの枠はありません。上のフォームから登録できます。'); return; }
        const byDate = {};
        slots.forEach((s) => { (byDate[s.date] || (byDate[s.date] = [])).push(s); });
        manageEl.innerHTML = Object.keys(byDate).sort().map((date) => `
          <div class="sup-day">
            <div class="sup-day-hd">${fmtDate(date)}</div>
            ${byDate[date].map((s) => `
              <div class="sup-mslot">
                <div class="sup-mslot-info">
                  <div><b>${periodLabel(s.period)}</b> <span class="muted">${h(s.start)}–${h(s.end)}</span> ・ ${h(s.teacherName)} 先生</div>
                  <div class="sup-slot-subs">${s.subjects.map((x) => `<span class="chip">${h(x)}</span>`).join('')} <span class="muted small">定員 ${s.capacity}・予約 ${s.booked}</span></div>
                  ${s.bookings.length ? `<div class="sup-mbk">${s.bookings.map((b) => `<div class="small">予約：<b>${h(b.studentName)}</b>（${h(b.subject)}）${b.note ? `<span class="muted">／${h(b.note)}</span>` : ''}</div>`).join('')}</div>` : '<div class="muted small">まだ予約はありません</div>'}
                </div>
                ${s.bookings.length ? '<span class="badge info">予約あり</span>' : `<button class="btn sm" data-del="${h(s.id)}">削除</button>`}
              </div>`).join('')}
          </div>`).join('');
        manageEl.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
          if (!window.confirm('この枠を削除しますか？')) return;
          try { await api.post('/api/supplementary/slots/' + btn.getAttribute('data-del') + '/close', {}); toast('枠を削除しました。'); await loadManage(); }
          catch (e) { toast(e.message, true); }
        }));
      }

      async function loadManage() {
        const data = await api.get('/api/supplementary/slots/manage');
        renderManage(data.slots || []);
      }

      async function init() {
        const data = await api.get('/api/supplementary/slots/manage');
        teacherOptions = data.teacherOptions || [];
        const periods = data.periods || {};
        if (data.canPickTeacher) {
          form.teacherId.innerHTML = teacherOptions.map((t) => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('');
          form.teacherId.addEventListener('change', renderSubjects);
        } else {
          teacherF.innerHTML = `<label>担当講師</label><input value="${teacherOptions[0] ? h(teacherOptions[0].name) : ''}" disabled>`;
        }
        form.period.innerHTML = Object.keys(periods).map((p) => `<option value="${p}">${p}限（${periods[p][0]}–${periods[p][1]}）</option>`).join('');
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        form.date.min = todayS;
        form.date.value = tomorrow.toISOString().slice(0, 10);
        renderSubjects();
        renderManage(data.slots || []);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const subjects = [...subsEl.querySelectorAll('input:checked')].map((c) => c.value);
        const payload = { date: v.date, period: Number(v.period), capacity: Number(v.capacity) || 1, note: v.note, subjects };
        if (form.teacherId && !form.teacherId.disabled) payload.teacherId = form.teacherId.value;
        try {
          await api.post('/api/supplementary/slots', payload);
          toast('補習枠を登録しました。');
          errBox.hidden = true;
          await loadManage();
        } catch (err) { errBox.textContent = err.message; errBox.hidden = false; errBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });

      init().catch((e) => { manageEl.innerHTML = `<div class="form-error" style="margin:12px">${h(e.message || '読み込みに失敗しました。')}</div>`; });
    },
  };
}

// ==================================================================
// アカウント設定
// ==================================================================
export async function account(ctx) {
  const data = await api.get('/api/account');
  const a = data.account;
  const html = `
    ${card('アカウント情報', `<dl class="kv"><dt>ログインID</dt><dd>${h(a.loginId)}</dd><dt>氏名</dt><dd>${h(a.name)}</dd><dt>権限</dt><dd>${h(a.roleLabel)}</dd></dl>`)}
    ${card('パスワードの変更', `
      <div id="pw-err" class="form-error" hidden></div>
      <form id="pw-form" style="max-width:360px">
        <div class="field" style="margin-bottom:12px"><label>現在のパスワード</label><input type="password" name="current" required></div>
        <div class="field" style="margin-bottom:12px"><label>新しいパスワード（8文字以上）</label><input type="password" name="next" required></div>
        <button class="btn primary" type="submit">パスワードを変更</button>
      </form>`)}
    ${card('ログアウト', `<button class="btn" id="logout-btn">ログアウト</button>`)}
  `;
  return {
    html,
    mount: (root) => {
      const form = root.querySelector('#pw-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = formValues(form);
        const errBox = root.querySelector('#pw-err');
        try { await api.post('/api/account/password', { current: v.current, next: v.next }); toast('パスワードを変更しました。'); form.reset(); errBox.hidden = true; }
        catch (err) { errBox.textContent = err.message; errBox.hidden = false; }
      });
      root.querySelector('#logout-btn').addEventListener('click', async () => { await api.logout(); location.hash = ''; location.reload(); });
    },
  };
}
