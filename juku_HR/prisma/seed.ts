import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { todayISO } from "../lib/constants";
import { hashPassword } from "../lib/auth";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

/** today からの相対日で "YYYY-MM-DD" を作る */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayISO(d);
}

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

async function main() {
  // 何度流しても同じ状態になるように全消し（依存の深い順）
  await prisma.schoolEvent.deleteMany();
  await prisma.wageRate.deleteMany();
  await prisma.messageRecipient.deleteMany();
  await prisma.message.deleteMany();
  await prisma.punch.deleteMany();
  await prisma.dutyRecord.deleteMany();
  await prisma.adminWork.deleteMany();
  await prisma.absenceCard.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.lessonRecord.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.term.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.room.deleteMany();
  await prisma.period.deleteMany();
  await prisma.subject.deleteMany();

  // ---- 科目 ----
  const subjectNames = ["英語", "数学", "国語", "理科", "社会"];
  const subjects = await Promise.all(
    subjectNames.map((name, i) => prisma.subject.create({ data: { name, order: i } })),
  );
  const byName = (n: string) => {
    const s = subjects.find((x) => x.name === n);
    if (!s) throw new Error(`科目が見つかりません: ${n}`);
    return s;
  };

  // ---- コマ ----
  // コマの時間帯は期タイプごとに違う。
  // レギュラーは学校の後なので夕方から3コマ。講習は学校が無いので朝から。
  const periodDefsByKind: Record<string, { name: string; startTime: string; endTime: string }[]> = {
    REGULAR: [
      { name: "1限", startTime: "17:00", endTime: "18:20" },
      { name: "2限", startTime: "18:30", endTime: "19:50" },
      { name: "3限", startTime: "20:00", endTime: "21:20" },
    ],
    SUMMER: [
      { name: "1限", startTime: "09:00", endTime: "10:20" },
      { name: "2限", startTime: "10:30", endTime: "11:50" },
      { name: "3限", startTime: "13:00", endTime: "14:20" },
      { name: "4限", startTime: "14:30", endTime: "15:50" },
      { name: "5限", startTime: "16:00", endTime: "17:20" },
      { name: "6限", startTime: "17:30", endTime: "18:50" },
    ],
    WINTER: [
      { name: "1限", startTime: "09:00", endTime: "10:20" },
      { name: "2限", startTime: "10:30", endTime: "11:50" },
      { name: "3限", startTime: "13:00", endTime: "14:20" },
      { name: "4限", startTime: "14:30", endTime: "15:50" },
    ],
    SPRING: [
      { name: "1限", startTime: "10:00", endTime: "11:20" },
      { name: "2限", startTime: "11:30", endTime: "12:50" },
      { name: "3限", startTime: "14:00", endTime: "15:20" },
      { name: "4限", startTime: "15:30", endTime: "16:50" },
    ],
  };

  const allPeriods = await Promise.all(
    Object.entries(periodDefsByKind).flatMap(([termKind, defs]) =>
      defs.map((p, i) => prisma.period.create({ data: { ...p, termKind, order: i } })),
    ),
  );
  // レギュラーのコマ。通常授業・出欠まわりはこれを使う。
  const periods = allPeriods.filter((p) => p.termKind === "REGULAR");

  // ---- 期 ----
  // 講習期間はコマの組み方も交通費の扱いも変わる。今日を含む年で作る。
  const thisYear = new Date().getFullYear();
  await prisma.term.createMany({
    data: [
      {
        name: `${thisYear}年 春期講習`,
        kind: "SPRING",
        startDate: `${thisYear}-03-25`,
        endDate: `${thisYear}-04-05`,
      },
      {
        name: `${thisYear}年度 レギュラー`,
        kind: "REGULAR",
        startDate: `${thisYear}-04-06`,
        endDate: `${thisYear}-07-20`,
      },
      {
        name: `${thisYear}年 夏期講習`,
        kind: "SUMMER",
        startDate: `${thisYear}-07-21`,
        endDate: `${thisYear}-08-31`,
      },
      {
        name: `${thisYear}年度 レギュラー(後期)`,
        kind: "REGULAR",
        startDate: `${thisYear}-09-01`,
        endDate: `${thisYear}-12-22`,
      },
      {
        name: `${thisYear}年 冬期講習`,
        kind: "WINTER",
        startDate: `${thisYear}-12-23`,
        endDate: `${thisYear + 1}-01-07`,
      },
    ],
  });

  // ---- 塾の予定 ----
  // 管理者が入れるもの。講師側のカレンダーにも出る。休校日はシフトを出せない。
  await prisma.schoolEvent.createMany({
    data: [
      { title: "お盆休み", kind: "CLOSED", startDate: `${thisYear}-08-13`, endDate: `${thisYear}-08-16`, note: "教室は閉めます" },
      { title: "年末年始", kind: "CLOSED", startDate: `${thisYear}-12-30`, endDate: `${thisYear + 1}-01-03`, note: "" },
      { title: "全国統一模試", kind: "EVENT", startDate: `${thisYear}-07-26`, endDate: `${thisYear}-07-26`, note: "9時開場・監督は2名" },
      { title: "保護者面談週間", kind: "EVENT", startDate: `${thisYear}-07-13`, endDate: `${thisYear}-07-18`, note: "各コマ後に面談枠あり" },
      { title: "夏期講習 前期スタート", kind: "EVENT", startDate: `${thisYear}-07-21`, endDate: `${thisYear}-07-21`, note: "" },
      { title: "教室清掃", kind: "CLOSED", startDate: `${thisYear}-08-31`, endDate: `${thisYear}-08-31`, note: "" },
    ],
  });
  const closedDates = new Set<string>();
  for (const e of await prisma.schoolEvent.findMany({ where: { kind: "CLOSED" } })) {
    const [y, m, d] = e.startDate.split("-").map(Number);
    for (let cur = new Date(y, m - 1, d); todayISO(cur) <= e.endDate; cur.setDate(cur.getDate() + 1)) {
      closedDates.add(todayISO(cur));
    }
  }

  // ---- 教室 ----
  const rooms = [];
  for (const r of [
    { name: "集団教室A", format: "GROUP", capacity: 20 },
    { name: "集団教室B", format: "GROUP", capacity: 16 },
    { name: "個別ブース1", format: "INDIVIDUAL", capacity: 2 },
    { name: "個別ブース2", format: "INDIVIDUAL", capacity: 2 },
    { name: "個別ブース3", format: "INDIVIDUAL", capacity: 2 },
  ]) {
    rooms.push(await prisma.room.create({ data: r }));
  }
  const groupRooms = rooms.filter((r) => r.format === "GROUP");
  const indivRooms = rooms.filter((r) => r.format === "INDIVIDUAL");

  // ---- 講師 ----
  // 社員は管理者画面、それ以外は講師画面に入る。保存するのはハッシュだけ。
  //
  // デモ用のパスワードは全員これ。"pass" や "password" のようなありふれた語は使わない。
  // ブラウザが既知の流出パスワード一覧と突き合わせていて、画面に
  // 「データ侵害で検出されました」と警告を出してしまうため（実際に "pass" は
  // 200万件超の流出で確認されている）。デモ中にこれが出ると、アプリが侵害されたように見える。
  // 変えるときは npm run check:password で流出していないことを確かめること。
  const DEMO_PASSWORD = "juku-hr-demo-2026";
  // コマ給は授業形態ごと。集団は人数を見るので単価が高め、個別は1対1より1対2が高い。
  const teacherDefs = [
    { name: "佐藤 健一", kana: "サトウ ケンイチ", loginId: "sato", role: "ADMIN", employment: "FULL_TIME", hourlyWage: 1600, rates: { GROUP: 3000, INDIV_1: 2400, INDIV_2: 2600 }, commuteRegular: 0, commuteSpot: 800, subjects: ["数学", "理科"] },
    { name: "鈴木 美咲", kana: "スズキ ミサキ", loginId: "suzuki", role: "ADMIN", employment: "FULL_TIME", hourlyWage: 1600, rates: { GROUP: 3000, INDIV_1: 2400, INDIV_2: 2600 }, commuteRegular: 0, commuteSpot: 700, subjects: ["英語", "国語"] },
    { name: "高橋 涼", kana: "タカハシ リョウ", loginId: "takahashi", role: "TEACHER", employment: "PART_TIME", hourlyWage: 1200, rates: { GROUP: 2400, INDIV_1: 2000, INDIV_2: 2200 }, commuteRegular: 0, commuteSpot: 600, subjects: ["数学", "英語"] },
    { name: "田中 陽菜", kana: "タナカ ヒナ", loginId: "tanaka", role: "TEACHER", employment: "PART_TIME", hourlyWage: 1200, rates: { GROUP: 2400, INDIV_1: 2000, INDIV_2: 2200 }, commuteRegular: 0, commuteSpot: 900, subjects: ["国語", "社会"] },
    { name: "伊藤 大輔", kana: "イトウ ダイスケ", loginId: "ito", role: "TEACHER", employment: "STUDENT", hourlyWage: 1100, rates: { GROUP: 2000, INDIV_1: 1800, INDIV_2: 1900 }, commuteRegular: 0, commuteSpot: 500, subjects: ["数学", "理科", "英語"] },
    { name: "渡辺 さくら", kana: "ワタナベ サクラ", loginId: "watanabe", role: "TEACHER", employment: "STUDENT", hourlyWage: 1100, rates: { GROUP: 2000, INDIV_1: 1800, INDIV_2: 1900 }, commuteRegular: 0, commuteSpot: 650, subjects: ["英語", "社会"] },
    // 個別しか持たない講師。集団の単価は入れない（未設定でも動くことの確認用）
    { name: "山本 翔", kana: "ヤマモト カケル", loginId: "yamamoto", role: "TEACHER", employment: "STUDENT", hourlyWage: 1100, rates: { INDIV_1: 1800, INDIV_2: 1900 }, commuteRegular: 0, commuteSpot: 550, subjects: ["理科", "数学"] },
    { name: "中村 結衣", kana: "ナカムラ ユイ", loginId: "nakamura", role: "TEACHER", employment: "PART_TIME", hourlyWage: 1250, rates: { GROUP: 2500, INDIV_1: 2100, INDIV_2: 2300 }, commuteRegular: 0, commuteSpot: 750, subjects: ["国語", "英語"] },
  ];
  const teachers = [];
  for (const t of teacherDefs) {
    const { subjects: subs, rates, ...rest } = t;
    teachers.push(
      await prisma.teacher.create({
        data: {
          ...rest,
          passwordHash: hashPassword(DEMO_PASSWORD),
          subjects: {
            create: subs.map((s, i) => ({
              subjectId: byName(s).id,
              level: i === 0 ? 3 : 2,
            })),
          },
          wageRates: {
            create: Object.entries(rates).map(([style, amount]) => ({ style, amount })),
          },
        },
      }),
    );
  }

  // ---- 生徒 ----
  const familyNames = ["青木", "石川", "上野", "遠藤", "大野", "加藤", "木村", "小林", "斉藤", "清水", "杉本", "関口", "園田", "田村", "土屋", "寺田", "内藤", "西野", "野口", "橋本", "林", "福田", "堀田", "松岡", "水野", "宮田", "村上", "森", "矢島", "山口"];
  const givenNames = ["太郎", "花子", "健太", "美優", "翔太", "彩音", "拓海", "結菜", "陸", "咲良"];
  const grades = ["小5", "小6", "中1", "中2", "中3", "高1", "高2"];
  const schools = ["第一中学校", "第二中学校", "南小学校", "北高等学校"];

  const students = [];
  for (let i = 0; i < 30; i++) {
    students.push(
      await prisma.student.create({
        data: {
          name: `${familyNames[i % familyNames.length]} ${givenNames[i % givenNames.length]}`,
          kana: "",
          grade: grades[i % grades.length],
          school: schools[i % schools.length],
        },
      }),
    );
  }

  // ---- 授業（過去5日ぶん + 今日）----
  // 過去の授業には記録と出欠を入れ、欠席者が出るようにする。
  const groupClasses = [
    { title: "中3 数学αクラス", subject: "数学", grade: "中3" },
    { title: "中2 英語標準クラス", subject: "英語", grade: "中2" },
    { title: "中1 国語クラス", subject: "国語", grade: "中1" },
  ];

  const progressSamples: Record<string, string[]> = {
    数学: ["二次方程式の解の公式（テキストp.42-45）", "相似な図形の性質（テキストp.60-63）", "平方根の計算（テキストp.28-31）"],
    英語: ["現在完了形 経験用法（テキストp.55-58）", "関係代名詞 which/that（テキストp.70-73）", "不定詞の副詞的用法（テキストp.33-36）"],
    国語: ["説明文『言葉の力』読解（テキストp.20-25）", "古文『徒然草』序段（テキストp.88-91）", "漢字の成り立ち（テキストp.12-15）"],
    理科: ["化学変化と原子・分子（テキストp.40-44）", "電流と磁界（テキストp.66-70）"],
    社会: ["江戸幕府の成立（テキストp.50-54）", "日本の工業地帯（テキストp.30-34）"],
  };
  const homeworkSamples: Record<string, string[]> = {
    数学: ["ワークp.20-21 全問", "プリント④の1〜8", "ワークp.33 練習問題1-6"],
    英語: ["ワークp.30-31、単語テスト範囲 Unit5", "プリント②裏面すべて", "教科書p.58 音読3回"],
    国語: ["ワークp.15-16、漢字ドリルp.8", "本文の要約200字", "プリント①"],
    理科: ["ワークp.25-27", "プリント③の実験まとめ"],
    社会: ["ワークp.18-19、年表の穴埋め", "地図帳p.12の確認"],
  };

  let cardCount = 0;

  for (let d = 5; d >= 0; d--) {
    const date = dayOffset(-d);
    const isPast = d > 0;

    // --- 集団授業 ---
    for (const [gi, gc] of groupClasses.entries()) {
      const subject = byName(gc.subject);
      const teacher = teachers.find((t) => t.name === (gi === 0 ? "佐藤 健一" : gi === 1 ? "鈴木 美咲" : "田中 陽菜"))!;
      const lesson = await prisma.lesson.create({
        data: {
          date,
          format: "GROUP",
          title: gc.title,
          periodId: periods[gi % periods.length].id,
          subjectId: subject.id,
          teacherId: teacher.id,
          roomId: groupRooms[gi % groupRooms.length].id,
        },
      });

      const roster = students.filter((s) => s.grade === gc.grade);
      if (roster.length === 0) continue;

      // 過去の授業だけ記録を入れる（今日ぶんは「これから書く」状態にしておく）
      if (isPast) {
        const prog = progressSamples[gc.subject];
        const hw = homeworkSamples[gc.subject];
        await prisma.lessonRecord.create({
          data: {
            lessonId: lesson.id,
            progress: prog[d % prog.length],
            homework: hw[d % hw.length],
          },
        });
      }

      // 出欠（過去のみ確定。1〜2名欠席させる）
      if (isPast) {
        const absentees = pick(roster, Math.random() < 0.5 ? 1 : 2);
        for (const s of roster) {
          const absent = absentees.some((a) => a.id === s.id);
          await prisma.attendance.create({
            data: {
              lessonId: lesson.id,
              studentId: s.id,
              status: absent ? "ABSENT" : "PRESENT",
            },
          });
        }

        // 直近の欠席ぶんは「未処理のカード」として残し、
        // 古いものは受渡済にして履歴が見えるようにする
        const record = await prisma.lessonRecord.findUnique({ where: { lessonId: lesson.id } });
        for (const s of absentees) {
          const delivered = d >= 4;
          await prisma.absenceCard.create({
            data: {
              lessonId: lesson.id,
              studentId: s.id,
              teacherId: teacher.id,
              progress: record?.progress ?? "",
              homework: record?.homework ?? "",
              comment: delivered ? "次回、範囲の確認テストをします。" : "",
              status: delivered ? "DELIVERED" : d === 1 ? "READY" : "DRAFT",
              deliveredAt: delivered ? new Date() : null,
            },
          });
          cardCount++;
        }
      } else {
        // 今日ぶんは出欠未入力（全員 PRESENT で初期化しておく運用）
        for (const s of roster) {
          await prisma.attendance.create({
            data: { lessonId: lesson.id, studentId: s.id, status: "PRESENT" },
          });
        }
      }
    }

    // --- 個別授業（1コマ2名まで）---
    const indivStudents = pick(students, 6);
    for (const [ri, room] of indivRooms.entries()) {
      const pair = indivStudents.slice(ri * 2, ri * 2 + 2);
      if (pair.length === 0) continue;
      const teacher = teachers[(ri + d) % teachers.length];
      const tSub = await prisma.teacherSubject.findFirst({
        where: { teacherId: teacher.id },
        orderBy: { level: "desc" },
      });
      const subjectId = tSub?.subjectId ?? subjects[0].id;
      const subjectName = subjects.find((s) => s.id === subjectId)!.name;

      const lesson = await prisma.lesson.create({
        data: {
          date,
          format: "INDIVIDUAL",
          title: "",
          periodId: periods[1].id,
          subjectId,
          teacherId: teacher.id,
          roomId: room.id,
        },
      });

      if (isPast) {
        const prog = progressSamples[subjectName] ?? ["テキスト演習"];
        const hw = homeworkSamples[subjectName] ?? ["宿題プリント"];
        await prisma.lessonRecord.create({
          data: {
            lessonId: lesson.id,
            progress: prog[d % prog.length],
            homework: hw[d % hw.length],
          },
        });
      }

      for (const [pi, s] of pair.entries()) {
        // 個別は欠席が出にくいので、たまに欠席させる
        const absent = isPast && pi === 0 && d === 2;
        await prisma.attendance.create({
          data: {
            lessonId: lesson.id,
            studentId: s.id,
            status: absent ? "ABSENT" : "PRESENT",
          },
        });
        if (absent) {
          const record = await prisma.lessonRecord.findUnique({ where: { lessonId: lesson.id } });
          await prisma.absenceCard.create({
            data: {
              lessonId: lesson.id,
              studentId: s.id,
              teacherId: teacher.id,
              progress: record?.progress ?? "",
              homework: record?.homework ?? "",
              comment: "",
              status: "DRAFT",
            },
          });
          cardCount++;
        }
      }
    }
  }

  // ---- シフト希望と確定 ----
  // 講師の予定はたいてい曜日で決まっているので、曜日パターンから起こす。
  // 0=日 .. 6=土
  const shiftPatterns: Record<string, { prefer: number[]; ok: number[]; ng: number[] }> = {
    "佐藤 健一": { prefer: [1, 3, 5], ok: [2, 4, 6], ng: [0] },
    "鈴木 美咲": { prefer: [2, 4], ok: [1, 3, 5, 6], ng: [0] },
    "高橋 涼": { prefer: [2, 4], ok: [6], ng: [0, 1, 3, 5] },
    "田中 陽菜": { prefer: [1, 5], ok: [3], ng: [0, 2, 4, 6] },
    "伊藤 大輔": { prefer: [3, 6], ok: [1, 2, 4, 5], ng: [0] },
    "渡辺 さくら": { prefer: [4], ok: [2, 6], ng: [0, 1, 3, 5] },
    "山本 翔": { prefer: [1, 2, 3, 4, 5], ok: [6], ng: [0] },
    "中村 結衣": { prefer: [5, 6], ok: [4], ng: [0, 1, 2, 3] },
  };

  const terms = await prisma.term.findMany();
  const termOf = (date: string) =>
    terms.find((t) => date >= t.startDate && date <= t.endDate) ?? null;
  // その日のコマ。期の登録が無い日はレギュラー扱い。
  const periodsOf = (date: string) => {
    const kind = termOf(date)?.kind ?? "REGULAR";
    return allPeriods.filter((p) => p.termKind === kind);
  };

  // 今月と来月ぶん
  const now = new Date();
  const shiftDates: string[] = [];
  for (const mOffset of [0, 1]) {
    const first = new Date(now.getFullYear(), now.getMonth() + mOffset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + mOffset + 1, 0).getDate();
    for (let i = 1; i <= last; i++) {
      shiftDates.push(todayISO(new Date(first.getFullYear(), first.getMonth(), i)));
    }
  }

  const requestRows: {
    teacherId: number;
    date: string;
    periodId: number;
    termId: number | null;
    status: string;
  }[] = [];

  for (const t of teachers) {
    const pat = shiftPatterns[t.name];
    if (!pat) continue;
    for (const date of shiftDates) {
      // 休校日にはシフトを出せない
      if (closedDates.has(date)) continue;
      const [yy, mm, dd] = date.split("-").map(Number);
      const dow = new Date(yy, mm - 1, dd).getDay();
      const status = pat.prefer.includes(dow)
        ? "PREFER"
        : pat.ok.includes(dow)
          ? "OK"
          : pat.ng.includes(dow)
            ? "NG"
            : null;
      if (!status) continue;
      const term = termOf(date);
      // 講習期間は朝から6コマあるので、その日のコマタイプに合ったコマで希望を作る
      for (const p of periodsOf(date)) {
        // 遅いコマまで出られる人ばかりではない。学生講師は最終コマを避けがち。
        const isLast = p.order === periodsOf(date).length - 1;
        if (t.employment === "STUDENT" && isLast && status !== "NG") {
          requestRows.push({
            teacherId: t.id,
            date,
            periodId: p.id,
            termId: term?.id ?? null,
            status: "OK",
          });
          continue;
        }
        requestRows.push({
          teacherId: t.id,
          date,
          periodId: p.id,
          termId: term?.id ?? null,
          status,
        });
      }
    }
  }
  await prisma.shiftRequest.createMany({ data: requestRows });

  // 確定はあえて偏らせておく。
  // 「集める人の贔屓で一部の講師に偏る」という実際の課題が画面上で見えるようにするため。
  const favored = ["山本 翔", "佐藤 健一"]; // よく声がかかる人
  const overlooked = ["渡辺 さくら", "中村 結衣"]; // 声がかかりにくい人

  const assignmentRows: {
    teacherId: number;
    date: string;
    periodId: number;
    termId: number | null;
  }[] = [];

  // 講習のシフトは前もって組むので、来月（夏期講習）ぶんまで確定を入れる。
  // 勤怠の実績は過去日ぶんだけ作るので、講習期間の交通費は
  // 勤怠管理で「予定どおりで実績にする」を押すと単価が切り替わるのが見える。
  for (const date of shiftDates) {
    if (closedDates.has(date)) continue;
    for (const p of periodsOf(date)) {
      const candidates = requestRows.filter(
        (r) => r.date === date && r.periodId === p.id && r.status !== "NG",
      );
      for (const c of candidates) {
        const t = teachers.find((x) => x.id === c.teacherId)!;
        const rate = favored.includes(t.name)
          ? 0.85
          : overlooked.includes(t.name)
            ? 0.15
            : 0.45;
        if (Math.random() < rate) {
          assignmentRows.push({
            teacherId: c.teacherId,
            date,
            periodId: p.id,
            termId: c.termId,
          });
        }
      }
    }
  }
  await prisma.shiftAssignment.createMany({ data: assignmentRows });

  // ---- 勤怠の実績 ----
  // 給与計算の根拠になるので、今日より前の確定シフトは「予定どおり出た」ことにする。
  // 打刻は、担当した最初のコマの少し前に出勤し、最後のコマの後に退勤する形で作る。
  const today = todayISO(now);
  const pastAssignments = assignmentRows.filter((a) => a.date < today);

  const byTeacherDate = new Map<string, typeof pastAssignments>();
  for (const a of pastAssignments) {
    const key = `${a.teacherId}:${a.date}`;
    const list = byTeacherDate.get(key) ?? [];
    list.push(a);
    byTeacherDate.set(key, list);
  }

  // コマ給は授業形態で変わるので、実績にも形態を入れる。
  // 社員は集団を持つことが多く、学生講師は個別が中心、という置き方にしておく。
  const dutyRows: { teacherId: number; date: string; periodId: number; style: string }[] = [];
  const punchRows: { teacherId: number; date: string; inAt: string; outAt: string }[] = [];
  const adminRows: { teacherId: number; date: string; minutes: number; note: string }[] = [];
  const adminNotes = ["教材準備", "採点", "保護者への連絡", "座席表の作成", "報告書の記入"];

  const minutesToHM = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const hmToMin = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };

  for (const [key, list] of byTeacherDate) {
    const [teacherIdStr, date] = key.split(":");
    const teacherId = Number(teacherIdStr);

    const teacher = teachers.find((x) => x.id === teacherId)!;
    for (const a of list) {
      const r = Math.random();
      const style =
        teacher.employment === "FULL_TIME"
          ? r < 0.6
            ? "GROUP"
            : r < 0.8
              ? "INDIV_2"
              : "INDIV_1"
          : r < 0.5
            ? "INDIV_2"
            : r < 0.85
              ? "INDIV_1"
              : "GROUP";
      dutyRows.push({ teacherId, date, periodId: a.periodId, style });
    }

    const myPeriods = list
      .map((a) => allPeriods.find((p) => p.id === a.periodId)!)
      .sort((x, y) => x.order - y.order);
    const first = myPeriods[0];
    const last = myPeriods[myPeriods.length - 1];

    // 15分前に来て、10分後に帰る
    punchRows.push({
      teacherId,
      date,
      inAt: minutesToHM(hmToMin(first.startTime) - 15),
      outAt: minutesToHM(hmToMin(last.endTime) + 10),
    });

    // 3日に1回くらい事務作業が入る
    if (Math.random() < 0.3) {
      adminRows.push({
        teacherId,
        date,
        minutes: [15, 30, 45, 60][Math.floor(Math.random() * 4)],
        note: adminNotes[Math.floor(Math.random() * adminNotes.length)],
      });
    }
  }

  await prisma.dutyRecord.createMany({ data: dutyRows });
  await prisma.punch.createMany({ data: punchRows });
  await prisma.adminWork.createMany({ data: adminRows });

  // ---- 講師連絡 ----
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  const notice = await prisma.message.create({
    data: {
      title: "夏期講習のシフト追加募集",
      body:
        "8/10〜8/14 の2限がまだ埋まっていません。\n入れる方はシフト提出から更新をお願いします。",
      kind: "NOTICE",
      createdAt: daysAgo(2),
      recipients: { create: teachers.map((t) => ({ teacherId: t.id })) },
    },
    include: { recipients: true },
  });
  // 半分くらいは読んでいる状態にしておく
  for (const r of notice.recipients) {
    if (Math.random() < 0.6) {
      await prisma.messageRecipient.update({
        where: { id: r.id },
        data: { readAt: daysAgo(1) },
      });
    }
  }

  const surveyOptions = ["入れます", "入れません", "相談したい"];
  const survey = await prisma.message.create({
    data: {
      title: "お盆期間（8/13〜8/16）の出勤可否",
      body: "お盆期間の講習について、現時点の可否を教えてください。",
      kind: "SURVEY",
      options: surveyOptions.join("\n"),
      createdAt: daysAgo(1),
      recipients: { create: teachers.map((t) => ({ teacherId: t.id })) },
    },
    include: { recipients: true },
  });
  for (const r of survey.recipients) {
    if (Math.random() < 0.7) {
      await prisma.messageRecipient.update({
        where: { id: r.id },
        data: {
          readAt: now,
          answer: surveyOptions[Math.floor(Math.random() * surveyOptions.length)],
          answeredAt: now,
        },
      });
    }
  }

  console.log(
    `seed 完了: 科目${subjects.length} コマ${periods.length} 教室${rooms.length} 講師${teachers.length} 生徒${students.length}\n` +
      `          授業${await prisma.lesson.count()} 欠席カード${cardCount} 期${terms.length}\n` +
      `          シフト希望${requestRows.length} 確定${assignmentRows.length}\n` +
      `          勤怠: コマ実績${dutyRows.length} 打刻${punchRows.length} 事務作業${adminRows.length}\n` +
      `          講師連絡${await prisma.message.count()}件 塾の予定${await prisma.schoolEvent.count()}件`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
