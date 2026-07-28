/**
 * シフトの中核ロジックを、実際の運用の流れどおりに動かして確かめる。
 *   npm run verify
 */
import { prisma } from "../lib/prisma";
import {
  bulkSetWeekday,
  loadSummary,
  setShiftRequest,
  spread,
  toggleAssignment,
} from "../lib/shifts";
import { SHIFT } from "../lib/constants";
import { dayOfWeek, monthDays } from "../lib/dates";

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
  await prisma.shiftAssignment.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.term.deleteMany();
  await prisma.absenceCard.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.lessonRecord.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.period.deleteMany();
}

async function main() {
  await reset();

  const p1 = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const p2 = await prisma.period.create({
    data: { name: "2限", startTime: "18:30", endTime: "19:50", order: 1 },
  });
  const a = await prisma.teacher.create({
    data: { name: "高橋 涼", loginId: "takahashi", passwordHash: "x", employment: "PART_TIME" },
  });
  const b = await prisma.teacher.create({
    data: { name: "中村 結衣", loginId: "nakamura", passwordHash: "x", employment: "PART_TIME" },
  });

  await prisma.term.create({
    data: {
      name: "2026年 夏期講習",
      kind: "SUMMER",
      startDate: "2026-07-21",
      endDate: "2026-08-31",
    },
  });

  const D = "2026-07-15"; // 水曜、レギュラー期間
  const SUMMER = "2026-07-22"; // 水曜、夏期講習期間

  console.log("\n[1] 希望を出すと記録される");
  await setShiftRequest(a.id, D, p1.id, SHIFT.OK);
  check("希望数", await prisma.shiftRequest.count(), 1);
  check(
    "状態",
    (await prisma.shiftRequest.findFirst({ where: { teacherId: a.id } }))?.status,
    SHIFT.OK,
  );

  console.log("\n[2] 別の状態を押すと上書きされる");
  await setShiftRequest(a.id, D, p1.id, SHIFT.PREFER);
  check("希望数は増えない", await prisma.shiftRequest.count(), 1);
  check(
    "状態",
    (await prisma.shiftRequest.findFirst({ where: { teacherId: a.id } }))?.status,
    SHIFT.PREFER,
  );

  console.log("\n[3] 同じ状態をもう一度押すと未回答に戻る");
  await setShiftRequest(a.id, D, p1.id, SHIFT.PREFER);
  check("希望数", await prisma.shiftRequest.count(), 0);

  console.log("\n[4] 講習期間の希望には、その期が紐づく");
  await setShiftRequest(a.id, SUMMER, p1.id, SHIFT.OK);
  const summerReq = await prisma.shiftRequest.findFirst({
    where: { date: SUMMER },
    include: { term: true },
  });
  check("期の種別", summerReq?.term?.kind, "SUMMER");
  await setShiftRequest(a.id, D, p1.id, SHIFT.OK);
  const regularReq = await prisma.shiftRequest.findFirst({
    where: { date: D },
    include: { term: true },
  });
  check("レギュラー期間は期に入らない（期を作っていないため）", regularReq?.term, null);

  console.log("\n[5] 曜日でまとめて入れられる");
  await prisma.shiftRequest.deleteMany();
  const july = monthDays({ year: 2026, month: 7 });
  const wednesdays = july.filter((d) => dayOfWeek(d) === 3);
  await bulkSetWeekday(a.id, wednesdays, [p1.id, p2.id], SHIFT.OK);
  check("7月の水曜の数", wednesdays.length, 5);
  check("入った希望数（水曜5日 × 2コマ）", await prisma.shiftRequest.count(), 10);

  console.log("\n[6] 確定は押すと付き、もう一度押すと外れる");
  await toggleAssignment(a.id, D, p1.id);
  check("確定数", await prisma.shiftAssignment.count(), 1);
  await toggleAssignment(a.id, D, p1.id);
  check("確定数", await prisma.shiftAssignment.count(), 0);

  console.log("\n[7] 「出られない」コマに確定を入れると衝突として数えられる");
  await setShiftRequest(b.id, D, p1.id, SHIFT.NG);
  await toggleAssignment(b.id, D, p1.id);
  const rows7 = await loadSummary("2026-07-01", "2026-07-31");
  const rowB = rows7.find((r) => r.teacherId === b.id)!;
  check("衝突数", rowB.conflicts, 1);
  check("NGは「出られる」に数えない", rowB.available, 0);

  console.log("\n[8] 負担の集計が合っている");
  await prisma.shiftAssignment.deleteMany();
  // a は水曜10コマ出られると回答済み。そのうち3コマ入れる。
  for (const d of wednesdays.slice(0, 3)) await toggleAssignment(a.id, d, p1.id);
  const rows8 = await loadSummary("2026-07-01", "2026-07-31");
  const rowA = rows8.find((r) => r.teacherId === a.id)!;
  check("出られるコマ数", rowA.available, 10);
  check("確定コマ数", rowA.assigned, 3);
  check("充足率", rowA.fillRate, 0.3);

  console.log("\n[9] 偏りは「希望を出した講師」の中の最大と最小の差");
  // b は希望が NG のみ＝出られる0なので、偏りの計算から外れる
  const rows9 = await loadSummary("2026-07-01", "2026-07-31");
  check("偏り（aの3コマのみが対象）", spread(rows9), 0);
  // 2人目に希望を出させて差をつくる
  await bulkSetWeekday(b.id, wednesdays, [p1.id], SHIFT.OK);
  const rows9b = await loadSummary("2026-07-01", "2026-07-31");
  check("aは3コマ・bは0コマなので差は3", spread(rows9b), 3);

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
