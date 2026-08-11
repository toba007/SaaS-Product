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
import { LESSON_STYLE, MESSAGE_KIND, PAY_BASIS, PAY_SOURCE } from "../lib/constants";
import {
  computeAllPayslips,
  computePayslip,
  payslipNoticeSentAt,
  payslipNoticeTitle,
  type Payslip,
} from "../lib/payroll";
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

/** 計算方法ごとの小計。項目が増えても数えられるようにする。 */
const sumOf = (slip: Payslip, basis: string) =>
  slip.lines.filter((l) => l.basis === basis).reduce((n, l) => n + l.amount, 0);

async function main() {
  await reset();

  const p1 = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const p2 = await prisma.period.create({
    data: { name: "2限", startTime: "18:30", endTime: "19:50", order: 1 },
  });

  // 賃金項目は管理者が作るもの。ここでは教室が作った想定で用意する。
  // 「模試監督」は授業形態を持たない項目で、実績が payItemId で直接この項目を指す。
  const mk = (
    name: string,
    basis: string,
    source = "",
    legacyStyle: string | null = null,
    order = 0,
  ) => prisma.payItem.create({ data: { name, basis, source, legacyStyle, order } });

  const iGroup = await mk("集団授業", PAY_BASIS.PER_SLOT, "", LESSON_STYLE.GROUP, 1);
  const i1on1 = await mk("個別1対1", PAY_BASIS.PER_SLOT, "", LESSON_STYLE.INDIV_1, 2);
  await mk("個別1対2", PAY_BASIS.PER_SLOT, "", LESSON_STYLE.INDIV_2, 3);
  const iMock = await mk("模試監督", PAY_BASIS.PER_SLOT, "", null, 4);
  const iAdmin = await mk("事務作業", PAY_BASIS.PER_HOUR, PAY_SOURCE.ADMIN, null, 5);
  await mk("交通費(定期あり)", PAY_BASIS.PER_DAY, PAY_SOURCE.REGULAR, null, 6);
  const iSpot = await mk("交通費(定期なし)", PAY_BASIS.PER_DAY, PAY_SOURCE.SPOT, null, 7);
  const iAllow = await mk("役職手当", PAY_BASIS.MONTHLY, "", null, 8);

  // 時給1200円・交通費は通常0円（定期あり）／講習600円（定期なし）
  // コマ給: 集団2400円 / 1対1 2000円 / 模試監督1500円。1対2は未設定のまま（設定漏れの確認用）
  const t = await prisma.teacher.create({
    data: {
      name: "高橋 涼",
      loginId: "takahashi",
      passwordHash: "x",
      employment: "PART_TIME",
      payRates: {
        create: [
          { payItemId: iGroup.id, amount: 2400 },
          { payItemId: i1on1.id, amount: 2000 },
          { payItemId: iMock.id, amount: 1500 },
          { payItemId: iAdmin.id, amount: 1200 },
          { payItemId: iSpot.id, amount: 600 },
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
  check("コマ数", slip.slotCount, 2);
  // 同じ2コマでも、集団と個別で単価が違う
  check("コマ給 集団2400 + 1対1 2000", sumOf(slip, PAY_BASIS.PER_SLOT), 4400);
  check(
    "項目ごとの内訳",
    slip.lines
      .filter((l) => l.basis === PAY_BASIS.PER_SLOT)
      .map((l) => [l.name, l.quantity, l.rate]),
    [
      ["集団授業", 1, 2400],
      ["個別1対1", 1, 2000],
    ],
  );

  console.log("\n[4b] 単価が未設定の形態は、0円にせず警告として数える");
  // 黙って0円で出すと、設定漏れが「働いていない」ように見えてしまう
  await setDuty(t.id, REG, p2.id, LESSON_STYLE.INDIV_2);
  slip = (await computePayslip(t.id, ym))!;
  check("単価未設定のコマ数", slip.unratedCount, 1);
  check(
    "その項目の単価は null",
    slip.lines.find((l) => l.name === "個別1対2")?.rate,
    null,
  );
  check("コマ給は集団ぶんだけ", sumOf(slip, PAY_BASIS.PER_SLOT), 2400);

  console.log("\n[5] コマは外せる");
  await setDuty(t.id, REG, p2.id, null);
  slip = (await computePayslip(t.id, ym))!;
  check("コマ数", slip.slotCount, 1);
  check("単価未設定は解消", slip.unratedCount, 0);

  console.log("\n[6] 事務作業は時給で計算する（月合計から1回だけ丸める）");
  await prisma.adminWork.create({
    data: { teacherId: t.id, date: REG, minutes: 25, note: "教材準備" },
  });
  await prisma.adminWork.create({
    data: { teacherId: t.id, date: REG, minutes: 20, note: "採点" },
  });
  slip = (await computePayslip(t.id, ym))!;
  check("事務作業(分)", slip.hourMinutes, 45);
  // 45分 = 0.75h × 1200円 = 900円。25分と20分を別々に丸めると 500+400=900 で同じだが、
  // 分数を先に足すことで端数の積み上がりを避けている。
  check("事務ぶん", sumOf(slip, PAY_BASIS.PER_HOUR), 900);

  console.log("\n[7] 交通費は通常期（定期あり）だと0円");
  slip = (await computePayslip(t.id, ym))!;
  check("出勤日数", slip.workDays, 1);
  check("交通費", slip.dailyPay, 0);
  check("通常期と判定", slip.commuteDays[0].spot, false);

  console.log("\n[8] 講習期間（定期なし）は日額が付く");
  await setDuty(t.id, SUM, p1.id, LESSON_STYLE.GROUP);
  slip = (await computePayslip(t.id, ym))!;
  check("出勤日数", slip.workDays, 2);
  check("交通費 講習1日 × 600円", slip.dailyPay, 600);
  check("講習期間と判定", slip.commuteDays.find((d) => d.date === SUM)?.spot, true);

  console.log("\n[9] 支給合計は コマ給 + 事務ぶん + 交通費");
  slip = (await computePayslip(t.id, ym))!;
  check(
    "合計は内訳の足し算",
    slip.total,
    slip.lines.reduce((n, l) => n + l.amount, 0),
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
  check("7月のコマ数", july.slotCount, 2);
  check("8月のコマ数", august.slotCount, 1);
  check("8月は講習なので交通費が付く", august.dailyPay, 600);

  console.log("\n[12b] 授業形態を持たない項目にも払える（模試監督・役職手当）");
  // 「コマ給が20や30」という塾に対応するには、授業形態と1対1で対応しない項目が要る。
  // 実績側が payItemId で項目を直接指すことで、項目をいくつ作っても計算できる。
  // REG の p1/p2 は [11] で埋まっているので、別の日に入れる
  await prisma.dutyRecord.create({
    data: { teacherId: t.id, date: "2026-07-16", periodId: p1.id, payItemId: iMock.id },
  });
  await prisma.teacherPayRate.create({
    data: { teacherId: t.id, payItemId: iAllow.id, amount: 10000 },
  });
  const withExtra = (await computePayslip(t.id, ym))!;
  check(
    "模試監督1コマ × 1500",
    withExtra.lines.find((l) => l.name === "模試監督")?.amount,
    1500,
  );
  check(
    "役職手当は月額固定",
    withExtra.lines.find((l) => l.name === "役職手当")?.amount,
    10000,
  );
  check(
    "単価を入れていない講師には手当が付かない",
    (await computePayslip(
      (
        await prisma.teacher.create({
          data: { name: "別の人", loginId: "other", passwordHash: "x" },
        })
      ).id,
      ym,
    ))!.lines.some((l) => l.name === "役職手当"),
    false,
  );


  console.log("\n[12c] どの賃金項目にも入らない実績は、黙って落とさず数える");
  // 授業形態は教室の設定（1対何人まで）で増える。増えた形態の項目を作り忘れると、
  // そのコマは明細のどの行にも入らず無給になる。0円で出るより気づきにくい。
  await prisma.dutyRecord.create({
    data: { teacherId: t.id, date: "2026-07-17", periodId: p1.id, style: "INDIV_3" },
  });
  const orphan = (await computePayslip(t.id, ym))!;
  check("取りこぼしたコマ数", orphan.orphanSlots, 1);
  check("どの形態か分かる", orphan.orphanStyles, ["INDIV_3"]);
  check("明細には出ない", orphan.lines.some((l) => l.name === "INDIV_3"), false);
  // 対応する項目を作れば解消する
  const iThree = await mk("個別1対3", PAY_BASIS.PER_SLOT, "", "INDIV_3", 9);
  await prisma.teacherPayRate.create({
    data: { teacherId: t.id, payItemId: iThree.id, amount: 2300 },
  });
  const fixed = (await computePayslip(t.id, ym))!;
  check("項目を作れば取りこぼしは0", fixed.orphanSlots, 0);
  check("金額が付く", fixed.lines.find((l) => l.name === "個別1対3")?.amount, 2300);


  console.log("\n[13] 明細ができたことを知らせる");
  // 支給が発生した人にだけ届くこと。0円の人に「明細ができました」は意味がない。
  const JULY = { year: 2026, month: 7 };
  check("送る前は未通知", await payslipNoticeSentAt(JULY), null);

  const zero = await prisma.teacher.create({
    data: { name: "働いていない人", loginId: "nobody", passwordHash: "x" },
  });
  const slips = await computeAllPayslips(JULY);
  const targets = slips.filter((x) => x.total > 0);
  check("0円の人は送り先に入らない", targets.some((x) => x.teacherId === zero.id), false);
  check("働いた人は入る", targets.some((x) => x.teacherId === t.id), true);

  await prisma.message.create({
    data: {
      title: payslipNoticeTitle(JULY),
      body: "本文",
      kind: MESSAGE_KIND.NOTICE,
      recipients: { create: targets.map((x) => ({ teacherId: x.teacherId })) },
    },
  });
  check("送った後は通知済みになる", (await payslipNoticeSentAt(JULY)) !== null, true);
  // 件名で照合しているので、月が違えば別ものとして扱われる
  check("別の月は未通知のまま", await payslipNoticeSentAt({ year: 2026, month: 8 }), null);
  check(
    "働いた人には届いている",
    await prisma.messageRecipient.count({ where: { teacherId: t.id } }),
    1,
  );
  check(
    "0円の人には届いていない",
    await prisma.messageRecipient.count({ where: { teacherId: zero.id } }),
    0,
  );

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
