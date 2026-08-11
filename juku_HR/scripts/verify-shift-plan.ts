/**
 * シフト計画・需要・勤務上限のデータモデルを、実際に読み書きして確かめる。
 *   npm run verify
 *
 * ここで確かめるのは「モデルが意図どおりに制約をかけているか」であって、
 * 割当の中身ではない（それは自動作成エンジンができてから）。
 */
import { prisma } from "../lib/prisma";
import {
  ASSIGNMENT_SOURCE,
  DEFAULT_SHIFT_RULE,
  LESSON_STYLE,
  PLAN_STATUS,
} from "../lib/constants";
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

async function main() {
  await reset();

  const english = await prisma.subject.create({ data: { name: "英語", order: 0 } });
  const math = await prisma.subject.create({ data: { name: "数学", order: 1 } });
  const p1 = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const takahashi = await prisma.teacher.create({
    data: { name: "高橋 涼", loginId: "takahashi", passwordHash: "x" },
  });

  console.log("\n[1] シフト計画は下書きから始まる");
  {
    const plan = await prisma.shiftPlan.create({
      data: { name: "2026年9月", fromDate: "2026-09-01", toDate: "2026-09-30" },
    });
    // 確定していないものが講師に見えると、確定前の予定で人が動いてしまう
    check("既定は下書き", plan.status, PLAN_STATUS.DRAFT);
    check("確定日時は未設定", plan.confirmedAt, null);
  }

  console.log("\n[2] 需要は科目ごとに持つ");
  {
    const plan = await prisma.shiftPlan.findFirstOrThrow();
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: "2026-09-01",
        periodId: p1.id,
        subjectId: english.id,
        format: LESSON_STYLE.INDIV_2,
        required: 3,
      },
    });
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: "2026-09-01",
        periodId: p1.id,
        subjectId: math.id,
        format: LESSON_STYLE.INDIV_2,
        required: 1,
      },
    });

    const rows = await prisma.shiftDemand.findMany({ where: { date: "2026-09-01" } });
    // 「講師4人」ではなく「英語3人・数学1人」で持てていること
    check("同じコマに科目別の需要を持てる", rows.length, 2);
    check("合計人数", rows.reduce((s, r) => s + r.required, 0), 4);
  }

  console.log("\n[3] 同じ 計画×日×コマ×科目×形態 は重複できない");
  {
    const plan = await prisma.shiftPlan.findFirstOrThrow();
    let rejected = false;
    try {
      await prisma.shiftDemand.create({
        data: {
          planId: plan.id,
          date: "2026-09-01",
          periodId: p1.id,
          subjectId: english.id,
          format: LESSON_STYLE.INDIV_2,
          required: 9,
        },
      });
    } catch {
      rejected = true;
    }
    check("二重登録が弾かれる", rejected, true);
  }

  console.log("\n[4] 割当は科目と形態を持つ");
  {
    const plan = await prisma.shiftPlan.findFirstOrThrow();
    const a = await prisma.shiftAssignment.create({
      data: {
        teacherId: takahashi.id,
        date: "2026-09-01",
        periodId: p1.id,
        planId: plan.id,
        subjectId: english.id,
        format: LESSON_STYLE.INDIV_2,
        source: ASSIGNMENT_SOURCE.AUTO,
        score: 1.25,
      },
    });
    check("担当科目が入る", a.subjectId, english.id);
    check("自動作成として記録される", a.source, ASSIGNMENT_SOURCE.AUTO);
    check("既定ではロックされていない", a.locked, false);
    check("評価値が残る", a.score, 1.25);
  }

  console.log("\n[5] 同じ講師が同じコマで2科目を持てない（H13）");
  {
    const plan = await prisma.shiftPlan.findFirstOrThrow();
    let rejected = false;
    try {
      // 英語に入っている高橋を、同じコマの数学にも入れようとする
      await prisma.shiftAssignment.create({
        data: {
          teacherId: takahashi.id,
          date: "2026-09-01",
          periodId: p1.id,
          planId: plan.id,
          subjectId: math.id,
          format: LESSON_STYLE.INDIV_2,
        },
      });
    } catch {
      rejected = true;
    }
    // 画面やエンジンの実装に関係なく、DB のレベルで防げていること
    check("二重割当が弾かれる", rejected, true);
  }

  console.log("\n[6] 勤務上限は未設定なら既定値を使う");
  {
    const none = await prisma.teacherShiftRule.findUnique({
      where: { teacherId: takahashi.id },
    });
    check("未設定の講師には行が無い", none, null);

    const rule = await prisma.teacherShiftRule.create({
      data: { teacherId: takahashi.id },
    });
    // schema.prisma の @default と lib/constants.ts の既定値がずれていないこと
    check("1日の上限", rule.maxPerDay, DEFAULT_SHIFT_RULE.maxPerDay);
    check("週の上限", rule.maxPerWeek, DEFAULT_SHIFT_RULE.maxPerWeek);
    check("連続の上限", rule.maxConsecutive, DEFAULT_SHIFT_RULE.maxConsecutive);
    check("週の下限", rule.minPerWeek, DEFAULT_SHIFT_RULE.minPerWeek);
  }

  console.log("\n[7] 計画を消すと、その需要も消える");
  {
    const plan = await prisma.shiftPlan.findFirstOrThrow();
    await prisma.shiftPlan.delete({ where: { id: plan.id } });
    check("需要が残らない", await prisma.shiftDemand.count(), 0);
    // 割当は消さない。確定済みのシフトが計画の削除で消えると勤怠・給与の根拠が飛ぶ。
    check("割当は残る", await prisma.shiftAssignment.count(), 1);
  }

  console.log("\n[8] 既存データを壊していない");
  {
    // 科目を持たない古い割当も、そのまま読めること
    const a = await prisma.shiftAssignment.create({
      data: { teacherId: takahashi.id, date: "2026-09-02", periodId: p1.id },
    });
    check("科目なしで作れる", a.subjectId, null);
    check("計画なしで作れる", a.planId, null);
    check("既定は手修正扱い", a.source, ASSIGNMENT_SOURCE.MANUAL);
  }

  console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
