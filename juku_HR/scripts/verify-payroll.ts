/**
 * 勤怠と給与計算の中核ロジックを、実際の運用の流れどおりに動かして確かめる。
 *   npm run verify
 */
import { prisma } from "../lib/prisma";
import {
  copyAssignmentsToDuties,
  openPunch,
  punch,
  punchMinutes,
  setDuty,
} from "../lib/attendance";
import { LESSON_STYLE } from "../lib/constants";
import { computePayslip } from "../lib/payroll";

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
  await prisma.punch.deleteMany();
  await prisma.dutyRecord.deleteMany();
  await prisma.adminWork.deleteMany();
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

  // 時給1200円・交通費は通常0円（定期あり）／講習600円（定期なし）
  // コマ給は授業形態ごと: 集団2400円 / 1対1 2000円 / 1対2は未設定のまま（設定漏れの確認用）
  const t = await prisma.teacher.create({
    data: {
      name: "高橋 涼",
      loginId: "takahashi",
      passwordHash: "x",
      employment: "PART_TIME",
      hourlyWage: 1200,
      commuteRegular: 0,
      commuteSpot: 600,
      wageRates: {
        create: [
          { style: LESSON_STYLE.GROUP, amount: 2400 },
          { style: LESSON_STYLE.INDIV_1, amount: 2000 },
        ],
      },
    },
  });

  await prisma.term.create({
    data: {
      name: "2026年度 レギュラー",
      kind: "REGULAR",
      startDate: "2026-07-01",
      endDate: "2026-07-20",
    },
  });
  await prisma.term.create({
    data: {
      name: "2026年 夏期講習",
      kind: "SUMMER",
      startDate: "2026-07-21",
      endDate: "2026-08-31",
    },
  });

  const ym = { year: 2026, month: 7 };
  const REG = "2026-07-15"; // レギュラー期間
  const SUM = "2026-07-22"; // 夏期講習期間

  console.log("\n[1] 打刻は1回目が出勤、2回目が退勤");
  check("打刻の結果", await punch(t.id, REG, "16:45"), "IN");
  check("出勤中である", (await openPunch(t.id, REG)) !== null, true);
  check("打刻の結果", await punch(t.id, REG, "20:00"), "OUT");
  check("出勤中ではない", (await openPunch(t.id, REG)) !== null, false);

  console.log("\n[2] 1日に複数回の出退勤ができる");
  await punch(t.id, REG, "21:00");
  await punch(t.id, REG, "22:30");
  const punches = await prisma.punch.findMany({
    where: { teacherId: t.id, date: REG },
    orderBy: { inAt: "asc" },
  });
  check("打刻の本数", punches.length, 2);
  const worked = punches.reduce((s, p) => s + punchMinutes(p.inAt, p.outAt), 0);
  check("実働(分) 3時間15分 + 1時間30分", worked, 195 + 90);

  console.log("\n[3] 退勤前の打刻は実働に数えない");
  await punch(t.id, REG, "23:00");
  const punches3 = await prisma.punch.findMany({
    where: { teacherId: t.id, date: REG },
  });
  check(
    "実働は変わらない",
    punches3.reduce((s, p) => s + punchMinutes(p.inAt, p.outAt), 0),
    285,
  );
  const open = await openPunch(t.id, REG);
  await prisma.punch.delete({ where: { id: open!.id } });

  console.log("\n[4] コマ給は授業形態ごとの単価で決まる");
  await setDuty(t.id, REG, p1.id, LESSON_STYLE.GROUP);
  await setDuty(t.id, REG, p2.id, LESSON_STYLE.INDIV_1);
  let slip = (await computePayslip(t.id, ym))!;
  check("コマ数", slip.lessonCount, 2);
  // 同じ2コマでも、集団と個別で単価が違う
  check("コマ給 集団2400 + 1対1 2000", slip.lessonPay, 4400);
  check(
    "形態ごとの内訳",
    slip.styleLines.map((l) => [l.style, l.count, l.rate]),
    [
      [LESSON_STYLE.GROUP, 1, 2400],
      [LESSON_STYLE.INDIV_1, 1, 2000],
    ],
  );

  console.log("\n[4b] 単価が未設定の形態は、0円にせず警告として数える");
  // 黙って0円で出すと、設定漏れが「働いていない」ように見えてしまう
  await setDuty(t.id, REG, p2.id, LESSON_STYLE.INDIV_2);
  slip = (await computePayslip(t.id, ym))!;
  check("単価未設定のコマ数", slip.unratedCount, 1);
  check(
    "その形態の単価は null",
    slip.styleLines.find((l) => l.style === LESSON_STYLE.INDIV_2)?.rate,
    null,
  );
  check("コマ給は集団ぶんだけ", slip.lessonPay, 2400);

  console.log("\n[5] コマは外せる");
  await setDuty(t.id, REG, p2.id, null);
  slip = (await computePayslip(t.id, ym))!;
  check("コマ数", slip.lessonCount, 1);
  check("単価未設定は解消", slip.unratedCount, 0);

  console.log("\n[6] 事務作業は時給で計算する（月合計から1回だけ丸める）");
  await prisma.adminWork.create({
    data: { teacherId: t.id, date: REG, minutes: 25, note: "教材準備" },
  });
  await prisma.adminWork.create({
    data: { teacherId: t.id, date: REG, minutes: 20, note: "採点" },
  });
  slip = (await computePayslip(t.id, ym))!;
  check("事務作業(分)", slip.adminMinutes, 45);
  // 45分 = 0.75h × 1200円 = 900円。25分と20分を別々に丸めると 500+400=900 で同じだが、
  // 分数を先に足すことで端数の積み上がりを避けている。
  check("事務ぶん", slip.adminPay, 900);

  console.log("\n[7] 交通費は通常期（定期あり）だと0円");
  slip = (await computePayslip(t.id, ym))!;
  check("出勤日数", slip.workDays, 1);
  check("交通費", slip.commutePay, 0);
  check("通常期と判定", slip.commuteDays[0].spot, false);

  console.log("\n[8] 講習期間（定期なし）は日額が付く");
  await setDuty(t.id, SUM, p1.id, LESSON_STYLE.GROUP);
  slip = (await computePayslip(t.id, ym))!;
  check("出勤日数", slip.workDays, 2);
  check("交通費 講習1日 × 600円", slip.commutePay, 600);
  check("講習期間と判定", slip.commuteDays.find((d) => d.date === SUM)?.spot, true);

  console.log("\n[9] 支給合計は コマ給 + 事務ぶん + 交通費");
  slip = (await computePayslip(t.id, ym))!;
  check(
    "合計は内訳の足し算",
    slip.total,
    slip.lessonPay + slip.adminPay + slip.commutePay,
  );
  // 集団2コマ(REGの1限・SUMの1限) × 2400 + 事務900 + 交通費600
  check("実額", slip.total, 2400 * 2 + 900 + 600);

  console.log("\n[10] 打刻し忘れても、コマを持っていれば出勤日に数える");
  const noPunchDays = slip.commuteDays.filter((d) => d.date === SUM).length;
  check("打刻の無い講習日も出勤日", noPunchDays, 1);

  console.log("\n[11] 確定シフトを実績に写せる（予定どおり出た日）");
  await prisma.dutyRecord.deleteMany();
  await prisma.shiftAssignment.createMany({
    data: [
      { teacherId: t.id, date: REG, periodId: p1.id },
      { teacherId: t.id, date: REG, periodId: p2.id },
    ],
  });
  check("写した件数", await copyAssignmentsToDuties(REG), 2);
  check("実績のコマ数", await prisma.dutyRecord.count(), 2);
  check("もう一度押しても増えない", await copyAssignmentsToDuties(REG), 0);

  console.log("\n[12] 別の月の実績は混ざらない");
  await setDuty(t.id, "2026-08-05", p1.id, LESSON_STYLE.GROUP);
  const july = (await computePayslip(t.id, { year: 2026, month: 7 }))!;
  const august = (await computePayslip(t.id, { year: 2026, month: 8 }))!;
  check("7月のコマ数", july.lessonCount, 2);
  check("8月のコマ数", august.lessonCount, 1);
  check("8月は講習なので交通費が付く", august.commutePay, 600);

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
