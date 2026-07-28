'use strict';
/**
 * 飯能教室を想定した架空のダミーデータを生成する。
 * 実在人物と結びつかないよう、姓名は一般的な語を機械的に組み合わせている。
 * 日付は「生成時点の当日」を基準に前後へ配置し、ダッシュボードが常に埋まるようにする。
 */
const { hashPassword } = require('./auth');

const DEMO_PASSWORD = 'lubo1234';

const SURNAMES = ['佐々木', '井上', '木村', '林', '清水', '山口', '森', '池田', '橋本', '阿部',
  '石川', '前田', '藤田', '後藤', '岡田', '長谷川', '村上', '近藤', '坂本', '遠藤'];
const STU_GIVEN = ['陽翔', '悠斗', '蓮', '湊', '大和', '樹', '結衣', '芽依', '咲良', '莉子',
  '葵', '悠真', '颯太', '律', '澪', '心春', '楓', '一花', '栞', '悠'];
const GDN_GIVEN = ['隆', '博之', '恵子', '真理', '和彦', '洋子', '直子', '慎一', '由美', '剛',
  '光男', '智子', '伸夫', '香織', '正樹', '悦子', '孝', '久美子', '英樹', '純子'];
const TEA = [
  { given: '拓也', subjects: ['数学', '理科'], grades: ['中1', '中2', '中3', '高1', '高2'] },
  { given: '直樹', subjects: ['英語'], grades: ['中1', '中2', '中3', '高1', '高2', '高3'] },
  { given: '美咲', subjects: ['国語', '社会'], grades: ['小5', '小6', '中1', '中2', '中3'] },
  { given: '健一', subjects: ['数学'], grades: ['小5', '小6', '中1', '中2', '中3'] },
  { given: '彩香', subjects: ['英語', '国語'], grades: ['小4', '小5', '小6', '中1', '中2'] },
  { given: '涼介', subjects: ['理科', '数学'], grades: ['中2', '中3', '高1', '高2', '高3'] },
  { given: '里奈', subjects: ['社会', '国語'], grades: ['中1', '中2', '中3', '高1'] },
  { given: '翔太', subjects: ['英語'], grades: ['小6', '中1', '中2', '中3'] },
  { given: '加奈', subjects: ['数学', '物理'], grades: ['高1', '高2', '高3'] },
  { given: '遼', subjects: ['国語', '社会'], grades: ['小4', '小5', '小6', '中1'] },
];
const T_SURNAME = ['松田', '中村', '小林', '加藤', '吉田', '山田', '佐藤', '伊藤', '渡辺', '高橋'];

const GRADES = ['小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3'];
const SUBJECTS = ['英語', '数学', '国語', '理科', '社会', '物理', '化学'];
const PERIODS = [
  { period: 1, start: '16:00', end: '17:20' },
  { period: 2, start: '17:30', end: '18:50' },
  { period: 3, start: '19:00', end: '20:20' },
  { period: 4, start: '20:30', end: '21:50' },
];
const CARE_NOTES = [
  '板書が苦手なため、要点はプリントで補助する。',
  '大きな物音が苦手。席は入口から離す配慮が望ましい。',
  '集中が途切れやすいので、こまめに声かけを行う。',
  '発言に時間がかかることがある。急かさず待つ。',
];

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

function seed(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = fmt(today);

  const classrooms = [{
    id: 'cls-hanno', name: '飯能教室',
    rooms: [
      { id: 'room-1', name: '第1教室', capacity: 12 },
      { id: 'room-2', name: '第2教室', capacity: 8 },
      { id: 'room-3', name: '個別ブースA', capacity: 2 },
      { id: 'room-4', name: '自習室', capacity: 20 },
    ],
  }];

  const users = [];
  const pw = () => hashPassword(DEMO_PASSWORD);

  // 管理者
  const admins = [
    { id: 'adm-1', name: '松本 誠', role: 'classroom_admin', classroomId: 'cls-hanno', title: '教室長' },
    { id: 'adm-2', name: '運営 管理者', role: 'system_admin', classroomId: null, title: 'システム管理' },
  ];
  users.push({ id: 'u-adm-1', loginId: 'kanri', role: 'classroom_admin', name: '松本 誠', linkedId: 'adm-1', classroomId: 'cls-hanno', ...pw() });
  users.push({ id: 'u-adm-2', loginId: 'admin', role: 'system_admin', name: '運営 管理者', linkedId: 'adm-2', classroomId: null, ...pw() });

  // 講師
  const teachers = TEA.map((t, i) => {
    const id = `tea-${pad(i + 1)}`;
    const name = `${T_SURNAME[i]} ${t.given}`;
    users.push({ id: `u-${id}`, loginId: `t${pad(i + 1)}`, role: 'teacher', name, linkedId: id, classroomId: 'cls-hanno', ...pw() });
    return {
      id, name, kana: '', subjects: t.subjects, grades: t.grades, classroomId: 'cls-hanno',
      employmentType: i % 3 === 0 ? '常勤' : '非常勤',
    };
  });

  // 生徒・保護者
  const students = [];
  const guardians = [];
  for (let i = 0; i < 20; i++) {
    const sid = `stu-${pad(i + 1)}`;
    const gid = `gdn-${pad(i + 1)}`;
    const surname = SURNAMES[i];
    const grade = GRADES[i % GRADES.length];
    const subj = [SUBJECTS[i % 5], SUBJECTS[(i + 2) % 5]].filter((v, k, a) => a.indexOf(v) === k);
    const student = {
      id: sid, name: `${surname} ${STU_GIVEN[i]}`, kana: '', grade,
      classroomId: 'cls-hanno', subjects: subj, guardianIds: [gid], status: '在籍',
      barcode: `LB${String(i + 1).padStart(3, '0')}`, // 入退室用バーコード（CODE39）
      careNote: i % 5 === 0 ? CARE_NOTES[(i / 5) % CARE_NOTES.length] : '', // 機密（管理者のみ）
    };
    const guardian = {
      id: gid, name: `${surname} ${GDN_GIVEN[i]}`, studentIds: [sid],
      relation: '保護者', phone: `090-0000-${pad(i + 1)}${pad(i + 1)}`, email: `guardian${pad(i + 1)}@example.com`,
    };
    students.push(student);
    guardians.push(guardian);
    users.push({ id: `u-${sid}`, loginId: `s${pad(i + 1)}`, role: 'student', name: student.name, linkedId: sid, classroomId: 'cls-hanno', ...pw() });
    users.push({ id: `u-${gid}`, loginId: `g${pad(i + 1)}`, role: 'guardian', name: guardian.name, linkedId: gid, classroomId: 'cls-hanno', ...pw() });
  }

  // 授業（時間割上のコマ）: 当日を中心に前後へ配置
  const lessons = [];
  let lessonSeq = 0;
  const mod = (n, m) => ((n % m) + m) % m;
  for (let off = -12; off <= 7; off++) {
    const date = fmt(addDays(today, off));
    // 各日4コマを機械的に割り当て（講師・生徒が偏らないよう分散）
    for (let p = 0; p < 4; p++) {
      const slot = PERIODS[p];
      const teacher = teachers[mod(off * 7 + p * 3, teachers.length)];
      const subject = teacher.subjects[p % teacher.subjects.length];
      // 生徒2〜3名の少人数クラス
      const base = mod(off * 5 + p * 4, 20);
      const studentIds = [students[base].id, students[mod(base + 6, 20)].id, students[mod(base + 13, 20)].id]
        .filter((v, k, a) => a.indexOf(v) === k);
      const room = classrooms[0].rooms[p % 3];
      lessonSeq++;
      lessons.push({
        id: `les-${pad(lessonSeq)}`, date, period: slot.period, start: slot.start, end: slot.end,
        subject, teacherId: teacher.id, studentIds, roomId: room.id, classroomId: 'cls-hanno',
        type: '通常', status: off < 0 ? '終了' : '予定',
      });
    }
  }

  // 授業記録30件（うち欠席10件）を過去のコマから生成
  const lessonRecords = [];
  const past = lessons.filter((l) => l.date <= anchor).sort((a, b) => (a.date < b.date ? -1 : 1));
  let recSeq = 0;
  let absCount = 0;
  outer:
  for (const les of past) {
    for (const stuId of les.studentIds) {
      if (lessonRecords.length >= 30) break outer;
      recSeq++;
      const makeAbsent = absCount < 10 && recSeq % 3 === 0;
      if (makeAbsent) absCount++;
      const attendance = makeAbsent ? '欠席' : (recSeq % 7 === 0 ? '遅刻' : '出席');
      const shared = attendance === '欠席';
      // 確認状況: 欠席共有のうち一部は未確認のまま
      const confirmed = shared && recSeq % 2 === 0;
      lessonRecords.push({
        id: `rec-${pad(recSeq)}`, lessonId: les.id, studentId: stuId, date: les.date,
        period: les.period, subject: les.subject, teacherId: les.teacherId, attendance,
        progress: `${les.subject}：${progressText(les.subject, recSeq)}`,
        homework: homeworkText(les.subject, recSeq),
        checkNext: recSeq % 4 === 0 ? '前回の小テストの直しを見直しておく。' : '',
        comment: commentText(attendance, recSeq),
        nextPlan: `次回は${les.subject}の続きを扱います。`,
        attachments: [],
        sharedWithStudent: shared, sharedWithGuardian: shared,
        confirmedByStudentAt: confirmed ? les.date : null,
        confirmedByGuardianAt: confirmed && recSeq % 3 !== 0 ? les.date : null,
        createdBy: les.teacherId, createdAt: `${les.date}T21:55:00`,
      });
    }
  }

  // お知らせ
  const notices = [
    { id: 'not-1', classroomId: 'cls-hanno', title: '夏期講習の受付を開始しました', body: '7月下旬からの夏期講習について、希望調査を順次ご案内します。詳細は各担当までお問い合わせください。', audience: 'all', createdBy: 'adm-1', createdAt: `${fmt(addDays(today, -2))}T10:00:00`, readBy: [] },
    { id: 'not-2', classroomId: 'cls-hanno', title: '第2教室の空調点検について', body: `${fmt(addDays(today, 3))}の午前中に空調点検を行います。授業への影響はありません。`, audience: 'all', createdBy: 'adm-1', createdAt: `${fmt(addDays(today, -1))}T09:00:00`, readBy: [] },
    { id: 'not-3', classroomId: 'cls-hanno', title: '【講師向け】授業記録の入力期限について', body: '授業当日中の入力にご協力ください。欠席された生徒には記録が自動で共有されます。', audience: 'teachers', createdBy: 'adm-1', createdAt: `${fmt(addDays(today, -1))}T12:00:00`, readBy: [] },
  ];

  // 入退室（当日分）: 数名を入室・一部を退室済みにしておく
  const todayLessonStudents = [...new Set(lessons.filter((l) => l.date === anchor).flatMap((l) => l.studentIds))];
  const attendanceEvents = todayLessonStudents.slice(0, 6).map((sid, i) => {
    const inH = 16 + (i % 3);
    return {
      id: `att-${pad(i + 1)}`, studentId: sid, date: anchor,
      checkInAt: `${anchor}T${pad(inH)}:${pad(3 + i)}:00`,
      checkOutAt: i < 2 ? `${anchor}T${pad(inH + 1)}:35:00` : null,
      byUserId: 'u-adm-1',
    };
  });

  // 通知（共有済み欠席記録から生成）: 生徒・保護者宛て、未読
  const notifications = [];
  let ntf = 0;
  lessonRecords.filter((r) => r.sharedWithGuardian).forEach((r) => {
    const stu = students.find((s) => s.id === r.studentId);
    const su = users.find((u) => u.role === 'student' && u.linkedId === r.studentId);
    if (su) notifications.push({ id: `ntf-${pad(++ntf)}`, userId: su.id, type: 'absence_record', refId: r.id, text: '欠席の授業記録が共有されました。', read: !!r.confirmedByStudentAt, createdAt: r.createdAt });
    (stu ? stu.guardianIds : []).forEach((gid) => {
      const gu = users.find((u) => u.role === 'guardian' && u.linkedId === gid);
      if (gu) notifications.push({ id: `ntf-${pad(++ntf)}`, userId: gu.id, type: 'absence_record', refId: r.id, text: '欠席の授業記録が共有されました。', read: !!r.confirmedByGuardianAt, createdAt: r.createdAt });
    });
  });

  // 相談・通報（5件）
  const consultations = [
    { id: 'con-1', classroomId: 'cls-hanno', createdByUserId: 'u-gdn-01', createdByRole: 'guardian', anonymous: false, wantsReply: true,
      category: '授業について', target: '', urgency: '低', body: '最近、宿題の量が多いようで家庭学習の負担を感じています。調整いただけないでしょうか。', attachments: [],
      status: '解決', assigneeUserId: 'u-adm-1',
      responses: [{ at: `${fmt(addDays(today, -4))}T15:10:00`, byUserId: 'u-adm-1', text: 'ご連絡ありがとうございます。担当講師と相談し、宿題量を調整しました。ご様子を見てまたお知らせください。', status: '解決' }],
      createdAt: `${fmt(addDays(today, -5))}T09:30:00` },
    { id: 'con-2', classroomId: 'cls-hanno', createdByUserId: 'u-stu-03', createdByRole: 'student', anonymous: false, wantsReply: true,
      category: '人間関係', target: '', urgency: '中', body: '自習室で一部の生徒がうるさく、集中できないことがあります。', attachments: [],
      status: '対応中', assigneeUserId: 'u-adm-1',
      responses: [{ at: `${fmt(addDays(today, -1))}T18:00:00`, byUserId: 'u-adm-1', text: '教えてくれてありがとう。自習室の見回りを増やして様子を見ます。', status: '対応中' }],
      createdAt: `${fmt(addDays(today, -2))}T20:15:00` },
    { id: 'con-3', classroomId: 'cls-hanno', createdByUserId: 'u-gdn-05', createdByRole: 'guardian', anonymous: true, wantsReply: false,
      category: 'ハラスメント', target: '', urgency: '高', body: '子どもが特定の生徒から強い言葉を受けているようです。名前は伏せて相談させてください。', attachments: [],
      status: '確認中', assigneeUserId: 'u-adm-1', responses: [],
      createdAt: `${fmt(addDays(today, -1))}T21:40:00` },
    { id: 'con-4', classroomId: 'cls-hanno', createdByUserId: 'u-stu-08', createdByRole: 'student', anonymous: false, wantsReply: true,
      category: '講師について', target: '', urgency: '中', body: '説明が少し速く、質問しづらいと感じることがあります。', attachments: [],
      status: '未確認', assigneeUserId: null, responses: [],
      createdAt: `${fmt(addDays(today, 0))}T17:05:00` },
    { id: 'con-5', classroomId: 'cls-hanno', createdByUserId: 'u-tea-02', createdByRole: 'teacher', anonymous: false, wantsReply: true,
      category: '体調・安全', target: '', urgency: '高', body: '授業中に体調不良を訴える生徒がいました。教室での対応方針を確認したいです。', attachments: [],
      status: '未確認', assigneeUserId: null, responses: [],
      createdAt: `${fmt(addDays(today, 0))}T19:20:00` },
  ];

  // メッセージ（スレッド2件）
  const messageThreads = [
    { id: 'thr-1', type: 'direct', title: '', participantUserIds: ['u-tea-01', 'u-gdn-01'], classroomId: 'cls-hanno', createdByUserId: 'u-gdn-01',
      createdAt: `${fmt(addDays(today, -2))}T20:00:00`, lastMessageAt: `${fmt(addDays(today, -1))}T09:15:00`,
      reads: { 'u-gdn-01': `${fmt(addDays(today, -2))}T20:05:00`, 'u-tea-01': `${fmt(addDays(today, -1))}T09:15:00` } },
    { id: 'thr-2', type: 'group', title: '講師連絡：来週のシフト確認', participantUserIds: ['u-adm-1', 'u-tea-01', 'u-tea-02'], classroomId: 'cls-hanno', createdByUserId: 'u-adm-1',
      createdAt: `${fmt(addDays(today, -1))}T12:00:00`, lastMessageAt: `${fmt(addDays(today, -1))}T12:00:00`,
      reads: { 'u-adm-1': `${fmt(addDays(today, -1))}T12:00:00` } },
  ];
  const messages = [
    { id: 'msg-1', threadId: 'thr-1', senderUserId: 'u-gdn-01', body: 'いつもお世話になっております。家庭学習の進め方について相談したいことがあります。', attachments: [], createdAt: `${fmt(addDays(today, -2))}T20:04:00`, deleted: false, readBy: [], reportedBy: [] },
    { id: 'msg-2', threadId: 'thr-1', senderUserId: 'u-tea-01', body: 'ご連絡ありがとうございます。次回の授業後にお時間よろしいでしょうか。', attachments: [], createdAt: `${fmt(addDays(today, -1))}T09:15:00`, deleted: false, readBy: [], reportedBy: [] },
    { id: 'msg-3', threadId: 'thr-2', senderUserId: 'u-adm-1', body: '来週のシフト希望を金曜までにご提出ください。よろしくお願いします。', attachments: [], createdAt: `${fmt(addDays(today, -1))}T12:00:00`, deleted: false, readBy: [], reportedBy: [] },
  ];

  // 勉強の質問（6件＋回答履歴）
  const gr = (sid) => (students.find((s) => s.id === sid) || {}).grade || '';
  const studyQuestions = [
    { id: 'sq-1', number: 'Q-0001', studentId: 'stu-04', studentUserId: 'u-stu-04', classroomId: 'cls-hanno',
      subject: '数学', unit: '一次関数', title: '一次関数のグラフの傾きが分かりません', body: 'y=2x+3 のグラフで、傾きが2になる理由が分かりません。表は書けました。', attempted: '表は作れました。', stuckPoint: 'グラフの傾きの読み取り方。', material: '中学必修テキスト 数学', page: '58', problemNo: '大問2', dueAt: fmt(addDays(today, 2)),
      routing: 'assigned', assignedTeacherId: 'tea-01', status: '回答あり', attachments: [], createdAt: `${fmt(addDays(today, -1))}T18:20:00`, updatedAt: `${fmt(addDays(today, -1))}T21:05:00`, reads: { 'u-stu-04': `${fmt(addDays(today, -1))}T18:20:00`, 'u-tea-01': `${fmt(addDays(today, -1))}T21:05:00` } },
    { id: 'sq-2', number: 'Q-0002', studentId: 'stu-05', studentUserId: 'u-stu-05', classroomId: 'cls-hanno',
      subject: '英語', unit: '現在完了', title: '現在完了の経験用法について', body: 'have been と have gone の使い分けが分かりません。', attempted: '教科書の例文を読みました。', stuckPoint: '意味の違い。', material: '', page: '', problemNo: '', dueAt: '',
      routing: 'open', assignedTeacherId: null, status: '回答待ち', attachments: [], createdAt: `${fmt(addDays(today, 0))}T16:40:00`, updatedAt: `${fmt(addDays(today, 0))}T16:40:00`, reads: { 'u-stu-05': `${fmt(addDays(today, 0))}T16:40:00` } },
    { id: 'sq-3', number: 'Q-0003', studentId: 'stu-06', studentUserId: 'u-stu-06', classroomId: 'cls-hanno',
      subject: '数学', unit: '因数分解', title: '因数分解の解き方', body: 'x^2-5x+6 の因数分解のやり方を教えてください。', attempted: '公式は覚えました。', stuckPoint: '数の組み合わせの見つけ方。', material: 'ワーク数学', page: '30', problemNo: '(3)', dueAt: fmt(addDays(today, 1)),
      routing: 'assigned', assignedTeacherId: 'tea-01', status: '講師確認中', attachments: [], createdAt: `${fmt(addDays(today, 0))}T17:10:00`, updatedAt: `${fmt(addDays(today, 0))}T19:30:00`, reads: { 'u-stu-06': `${fmt(addDays(today, 0))}T17:10:00`, 'u-tea-01': `${fmt(addDays(today, 0))}T19:30:00` } },
    { id: 'sq-4', number: 'Q-0004', studentId: 'stu-04', studentUserId: 'u-stu-04', classroomId: 'cls-hanno',
      subject: '理科', unit: '電流と回路', title: 'オームの法則の計算', body: '抵抗の直列と並列で式が変わる理由が分かりません。', attempted: '直列は解けました。', stuckPoint: '並列の合成抵抗。', material: '', page: '', problemNo: '', dueAt: '',
      routing: 'open', assignedTeacherId: 'tea-01', status: '解決済み', attachments: [], createdAt: `${fmt(addDays(today, -3))}T18:00:00`, updatedAt: `${fmt(addDays(today, -2))}T20:00:00`, reads: { 'u-stu-04': `${fmt(addDays(today, -2))}T20:10:00`, 'u-tea-01': `${fmt(addDays(today, -2))}T20:00:00` } },
    { id: 'sq-5', number: 'Q-0005', studentId: 'stu-07', studentUserId: 'u-stu-07', classroomId: 'cls-hanno',
      subject: '国語', unit: '古文', title: '古文の助動詞「けり」について', body: '「けり」の意味が複数あって混乱します。', attempted: '単語帳は確認しました。', stuckPoint: '文中での見分け方。', material: '古文単語帳', page: '12', problemNo: '', dueAt: fmt(addDays(today, 3)),
      routing: 'assigned', assignedTeacherId: 'tea-07', status: '追加確認中', attachments: [], createdAt: `${fmt(addDays(today, -1))}T20:00:00`, updatedAt: `${fmt(addDays(today, 0))}T09:00:00`, reads: { 'u-stu-07': `${fmt(addDays(today, 0))}T09:05:00`, 'u-tea-07': `${fmt(addDays(today, 0))}T09:00:00` } },
    { id: 'sq-6', number: 'Q-0006', studentId: 'stu-08', studentUserId: 'u-stu-08', classroomId: 'cls-hanno',
      subject: '数学', unit: '二次関数', title: '二次関数の最大最小', body: '定義域があるときの最大最小の求め方が分かりません。', attempted: 'グラフは描けました。', stuckPoint: '頂点が定義域外のとき。', material: '', page: '', problemNo: '', dueAt: '',
      routing: 'open', assignedTeacherId: null, status: '回答待ち', attachments: [], createdAt: `${fmt(addDays(today, 0))}T19:45:00`, updatedAt: `${fmt(addDays(today, 0))}T19:45:00`, reads: { 'u-stu-08': `${fmt(addDays(today, 0))}T19:45:00` } },
  ];
  const studyQuestionMessages = [
    { id: 'sqm-1', questionId: 'sq-1', senderUserId: 'u-tea-01', senderRole: 'teacher', kind: 'answer', body: '傾きは「xが1増えるとyがいくつ増えるか」を表します。y=2x+3 では xが1増えるとyが2増えるので傾きは2です。表で確認してみましょう。', attachments: [], createdAt: `${fmt(addDays(today, -1))}T21:05:00`, deleted: false },
    { id: 'sqm-2', questionId: 'sq-4', senderUserId: 'u-tea-01', senderRole: 'teacher', kind: 'answer', body: '並列は「1/R = 1/R1 + 1/R2」で合成します。電流が分かれて流れるためです。', attachments: [], createdAt: `${fmt(addDays(today, -2))}T19:40:00`, deleted: false },
    { id: 'sqm-3', questionId: 'sq-4', senderUserId: 'u-stu-04', senderRole: 'student', kind: 'followup', body: 'ありがとうございます！理解できました。', attachments: [], createdAt: `${fmt(addDays(today, -2))}T20:05:00`, deleted: false },
    { id: 'sqm-4', questionId: 'sq-5', senderUserId: 'u-tea-07', senderRole: 'teacher', kind: 'answer', body: '「けり」は主に「過去（〜た）」と「詠嘆（〜だなあ）」です。会話文や和歌では詠嘆になりやすいです。', attachments: [], createdAt: `${fmt(addDays(today, -1))}T20:40:00`, deleted: false },
    { id: 'sqm-5', questionId: 'sq-5', senderUserId: 'u-stu-07', senderRole: 'student', kind: 'followup', body: '和歌のときはいつも詠嘆になりますか？', attachments: [], createdAt: `${fmt(addDays(today, 0))}T09:00:00`, deleted: false },
  ];

  const db = {
    meta: { anchor, seededAt: now.toISOString(), userModified: false, schema: 1 },
    classrooms,
    subjects: SUBJECTS,
    admins,
    teachers,
    students,
    guardians,
    users,
    lessons,
    lessonRecords,
    notices,
    attendanceEvents,
    notifications,
    auditLogs: [],
    consultations,
    messageThreads,
    messages,
    studyQuestions,
    studyQuestionMessages,
    // 後続フェーズで使用するコレクション（現時点は空で確保）
    shiftAvailabilities: [],
    studentAvailabilities: [],
    schedules: [],
    supplementarySlots: [],
    supplementaryBookings: [],
    sosAlerts: [],
  };
  demoSupplementary(db, now);
  return db;
}

/**
 * 補習可能枠のデモデータを生成する（フェーズ3）。
 * 通常授業が入っていない時限に、各講師の空き枠を機械的に配置し、
 * 生徒側の予約画面が起動直後から埋まるようにする。
 * userModified=false の間は起動ごとに当日基準で再生成される（store.js）。
 */
function demoSupplementary(d, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = fmt(today);
  const busy = new Set(d.lessons.map((l) => `${l.teacherId}|${l.date}|${l.period}`));
  const slots = [];
  let seq = 0;
  // 翌日〜10日先まで。各講師が1日1枠を目安に、通常授業と重ならない時限へ配置する。
  for (let off = 1; off <= 10; off++) {
    const date = fmt(addDays(today, off));
    d.teachers.forEach((t, ti) => {
      if ((ti + off) % 2 !== 0) return;                 // 枠を程よく間引く
      const period = ((ti + off) % 4) + 1;
      if (busy.has(`${t.id}|${date}|${period}`)) return; // 通常授業と重複させない
      seq += 1;
      slots.push({
        id: `sup-${pad(seq)}`, classroomId: t.classroomId, teacherId: t.id, date, period,
        subjects: t.subjects.slice(0, (ti % 2 ? 1 : t.subjects.length)), // 一部は1科目のみ対応
        capacity: 1, note: ti % 3 === 0 ? '欠席分の振替に対応します。' : '',
        status: 'open', createdByUserId: `u-${t.id}`, createdAt: `${anchor}T09:00:00`,
      });
    });
  }
  d.supplementarySlots = slots;

  // デモ用の確定予約を1件（stu-01）。通常授業と重ならない枠を選ぶ。
  const s1busy = new Set(d.lessons.filter((l) => l.studentIds.includes('stu-01')).map((l) => `${l.date}|${l.period}`));
  const stu1 = d.students.find((s) => s.id === 'stu-01');
  const pick = slots.find((s) => stu1 && s.classroomId === stu1.classroomId && !s1busy.has(`${s.date}|${s.period}`));
  d.supplementaryBookings = [];
  if (pick) {
    d.supplementaryBookings.push({
      id: 'sbk-demo1', slotId: pick.id, studentId: 'stu-01', subject: pick.subjects[0],
      note: '欠席した回の振替をお願いします。', status: 'confirmed', bookedByUserId: 'u-stu-01',
      createdAt: `${anchor}T10:00:00`, cancelledAt: null, cancelledByUserId: null,
    });
  }
}

function progressText(subject, n) {
  const map = {
    英語: ['現在完了の用法を確認', '関係代名詞の演習', '長文読解の精読'],
    数学: ['一次関数のグラフ', '因数分解の演習', '連立方程式の文章題'],
    国語: ['説明文の要旨把握', '古文単語の暗記確認', '記述問題の型を練習'],
    理科: ['光の反射と屈折', '化学変化と質量', '電流と回路'],
    社会: ['地理：世界の気候', '歴史：明治維新', '公民：三権分立'],
    物理: ['運動方程式の演習', '力のつり合い', '等加速度運動'],
    化学: ['モル計算の基礎', '中和反応の量的関係', '酸と塩基'],
  };
  const arr = map[subject] || ['基本事項の確認'];
  return arr[n % arr.length];
}
function homeworkText(subject, n) {
  return n % 5 === 0 ? '' : `${subject}ワーク p.${20 + (n % 40)}〜p.${22 + (n % 40)}`;
}
function commentText(attendance, n) {
  if (attendance === '欠席') return '本日は欠席でした。進んだ範囲と宿題を共有します。次回で補足します。';
  if (attendance === '遅刻') return '遅れて参加。前半の内容は次回に補います。';
  const arr = ['集中して取り組めていました。', '前回より正答率が上がっています。', '基礎は定着。応用を増やしましょう。', '宿題の取り組みが丁寧です。'];
  return arr[n % arr.length];
}

module.exports = { seed, DEMO_PASSWORD, demoSupplementary };
