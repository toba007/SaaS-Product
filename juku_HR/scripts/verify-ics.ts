/**
 * カレンダー購読フィード（.ics）を確かめる。
 *
 * 書式が少しでも崩れると、カレンダーアプリは理由を出さずに読み込みをやめる。
 * 気づくのは「講師のカレンダーに何も出ない」という問い合わせが来たときなので、
 * ここで機械的に確かめておく。
 *   npm run verify
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { buildIcs, toUtcStamp } from "../lib/ics";
import { feedForToken, toEvents } from "../lib/ics-feed";
import { PLAN_STATUS, ROLE, todayISO } from "../lib/constants";
import { shiftDays } from "../lib/dates";
import { resetAll } from "./_reset";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}` +
      (ok
        ? ""
        : `\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`),
  );
}

async function reset() {
  await resetAll();
}

const PERIOD = { name: "1限", startTime: "17:00", endTime: "18:20" };

async function main() {
  await reset();

  console.log("\n[1] 日本時間を UTC に直す（サマータイムが無いので9時間固定）");
  check("17:00 JST は 08:00 UTC", toUtcStamp("2026-09-15", "17:00"), "20260915T080000Z");
  // 0時台は前日の UTC になる。ここを間違えると1日ずれた予定が入る。
  check("00:30 JST は前日15:30 UTC", toUtcStamp("2026-09-15", "00:30"), "20260914T153000Z");
  check("うるう日もそのまま", toUtcStamp("2028-02-29", "09:00"), "20280229T000000Z");

  console.log("\n[2] 崩れると全体が読めなくなる書式");
  const ics = buildIcs(
    [
      {
        uid: "u1@juku-hr",
        date: "2026-09-15",
        startTime: "17:00",
        endTime: "18:20",
        summary: "塾 数学; 個別, B",
        description: "1行目\n2行目",
      },
    ],
    { calendarName: "塾HR テスト", now: new Date(Date.UTC(2026, 8, 1)) },
  );
  check("改行は CRLF", ics.includes("\r\n") && !/[^\r]\n/.test(ics), true);
  check("VCALENDAR で始まる", ics.startsWith("BEGIN:VCALENDAR\r\n"), true);
  check("VCALENDAR で終わる", ics.endsWith("END:VCALENDAR\r\n"), true);
  // ; と , は区切り記号なので、そのまま出すと1件の崩れが全体に波及する
  check("記号を打ち消している", ics.includes("SUMMARY:塾 数学\\; 個別\\, B"), true);
  check("本文の改行は \\n にする", ics.includes("DESCRIPTION:1行目\\n2行目"), true);

  console.log("\n[3] 長い日本語を折り返しても文字化けしない");
  const long = buildIcs(
    [
      {
        uid: "u2@juku-hr",
        date: "2026-09-15",
        startTime: "17:00",
        endTime: "18:20",
        summary: "あ".repeat(120),
      },
    ],
    { calendarName: "x", now: new Date(Date.UTC(2026, 8, 1)) },
  );
  // 折り返しは "CRLF + 空白1つ"。それを畳み直せば元の文字列に戻るはず。
  const unfolded = long.replace(/\r\n /g, "");
  check("畳み直すと元に戻る", unfolded.includes(`SUMMARY:${"あ".repeat(120)}`), true);
  check("文字化けが無い", long.includes("�"), false);
  const longest = Math.max(
    ...long.split("\r\n").map((l) => Buffer.from(l, "utf8").length),
  );
  check("どの行も75オクテット以内", longest <= 75, true);

  console.log("\n[4] 出勤と授業は、同じコマなら1件にまとめる");
  const merged = toEvents(
    [{ date: "2026-09-15", periodId: 1, format: "INDIV_2", period: PERIOD }],
    [
      {
        date: "2026-09-15",
        periodId: 1,
        format: "INDIVIDUAL",
        title: "",
        period: PERIOD,
        subject: { name: "数学" },
        room: { name: "個別ブースB" },
        attendances: [{ studentId: 7 }, { studentId: 3 }],
      },
    ],
  );
  check("予定は1件", merged.length, 1);
  check("件名に科目が入る", merged[0].summary, "塾 数学（1限）");
  check("教室が入る", merged[0].location, "個別ブースB");
  check("同じコマなら uid も1つ", merged[0].uid, "2026-09-15-1@juku-hr");

  console.log("\n[5] 生徒の実名は載せない");
  check("仮名になっている", merged[0].description?.includes("生徒003、生徒007"), true);
  // Lesson.format は GROUP|INDIVIDUAL。コマ給の style と取り違えると生の値が出る
  check("形態が日本語になる", merged[0].description?.includes("個別"), true);

  console.log("\n[6] 授業だけで出勤が確定していないコマは、そう分かるようにする");
  const lessonOnly = toEvents(
    [],
    [
      {
        date: "2026-09-16",
        periodId: 1,
        format: "GROUP",
        title: "",
        period: PERIOD,
        subject: { name: "英語" },
        room: { name: "集団教室A" },
        attendances: [],
      },
    ],
  );
  check("断り書きが入る", lessonOnly[0].description?.includes("出勤はまだ確定していません"), true);

  console.log("\n[7] 検討中のシフトは私物のカレンダーに流さない");
  const subject = await prisma.subject.create({ data: { name: "数学" } });
  const period = await prisma.period.create({ data: { ...PERIOD, order: 0 } });
  await prisma.room.create({
    data: { name: "個別ブースB", format: "INDIVIDUAL", capacity: 2 },
  });
  const t = await prisma.teacher.create({
    data: { name: "高橋 涼", loginId: "takahashi", passwordHash: "x", role: ROLE.TEACHER },
  });

  const now = new Date();
  const d1 = shiftDays(todayISO(now), 3);
  const d2 = shiftDays(todayISO(now), 4);

  const draft = await prisma.shiftPlan.create({
    data: { name: "9月（検討中）", fromDate: d1, toDate: d2, status: PLAN_STATUS.DRAFT },
  });
  // 検討中の計画に属する割当
  await prisma.shiftAssignment.create({
    data: { teacherId: t.id, date: d1, periodId: period.id, planId: draft.id, subjectId: subject.id },
  });
  // 手で入れた割当（計画に属さない）
  await prisma.shiftAssignment.create({
    data: { teacherId: t.id, date: d2, periodId: period.id },
  });

  const feed = await feedForToken(
    (await prisma.teacher.findUniqueOrThrow({ where: { id: t.id } })).icsToken,
    now,
  );
  check("フィードが返る", feed !== null, true);
  check("検討中の日は出ない", feed!.ics.includes(`${d1.replace(/-/g, "")}T`), false);
  check("手で入れた日は出る", feed!.ics.includes(`UID:${d2}-${period.id}@juku-hr`), true);

  console.log("\n[8] トークンが違えば何も返さない");
  check("でたらめなトークン", await feedForToken("deadbeef", now), null);
  await prisma.teacher.update({ where: { id: t.id }, data: { active: false } });
  const gone = await prisma.teacher.findUniqueOrThrow({ where: { id: t.id } });
  check("退職した講師のURLは切れる", await feedForToken(gone.icsToken, now), null);

  console.log(failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件 期待と違う`);
  process.exit(failed === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
