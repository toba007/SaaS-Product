/**
 * 自動作成を DB ごと通しで動かして確かめる。
 *   npm run verify
 *
 * エンジン単体（verify-shifts-auto.ts）とは別に、
 * 「計画を作る → 必要人数を入れる → 実行 → 保存される」までが繋がっているかを見る。
 * ここが通れば、画面のボタンを押したときに同じことが起きる。
 */
import { prisma } from "../lib/prisma";
import { checkPreconditions, parseLastResult, runGenerate } from "../lib/shifts-plan";
import {
  ASSIGNMENT_SOURCE,
  LESSON_STYLE,
  PLAN_STATUS,
  SHIFT,
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

const FROM = "2026-09-01"; // 火曜
const TO = "2026-09-03"; // 木曜

async function main() {
  await reset();

  // ---- 下ごしらえ ----
  const english = await prisma.subject.create({ data: { name: "英語", order: 0 } });
  const math = await prisma.subject.create({ data: { name: "数学", order: 1 } });

  const p1 = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const p2 = await prisma.period.create({
    data: { name: "2限", startTime: "18:30", endTime: "19:50", order: 1 },
  });

  // 高橋=英語(専門)、田中=英語(可)、伊藤=数学のみ
  const takahashi = await prisma.teacher.create({
    data: {
      name: "高橋 涼",
      loginId: "t-takahashi",
      passwordHash: "x",
      subjects: { create: [{ subjectId: english.id, level: 3 }] },
    },
  });
  const tanaka = await prisma.teacher.create({
    data: {
      name: "田中 陽菜",
      loginId: "t-tanaka",
      passwordHash: "x",
      subjects: { create: [{ subjectId: english.id, level: 1 }] },
    },
  });
  const ito = await prisma.teacher.create({
    data: {
      name: "伊藤 大輔",
      loginId: "t-ito",
      passwordHash: "x",
      subjects: { create: [{ subjectId: math.id, level: 2 }] },
    },
  });

  const plan = await prisma.shiftPlan.create({
    data: { name: "検証", fromDate: FROM, toDate: TO },
  });

  console.log("\n[1] 準備ができていないうちは実行できない");
  {
    // 需要も希望もまだ無い
    const blocked = await checkPreconditions(plan.id);
    const codes = blocked.map((b) => b.code).sort();
    check("必要人数と希望が足りないと止まる", codes, ["P4", "P5"]);

    const out = await runGenerate(plan.id);
    check("実行しても書き込まない", out.ok, false);
    check("割当は0件のまま", await prisma.shiftAssignment.count(), 0);
  }

  // ---- 希望と需要を入れる ----
  for (const t of [takahashi, tanaka, ito]) {
    for (const d of [FROM, "2026-09-02", TO]) {
      for (const p of [p1, p2]) {
        await prisma.shiftRequest.create({
          data: {
            teacherId: t.id,
            date: d,
            periodId: p.id,
            status: t.id === tanaka.id ? SHIFT.PREFER : SHIFT.OK,
          },
        });
      }
    }
  }

  // 9/1 の1限に英語2人
  await prisma.shiftDemand.create({
    data: {
      planId: plan.id,
      date: FROM,
      periodId: p1.id,
      subjectId: english.id,
      format: LESSON_STYLE.INDIV_2,
      required: 2,
    },
  });

  console.log("\n[2] 担当できる講師がいない科目があると止まる（P8）");
  {
    // 国語を足して需要も入れる。誰も担当できない。
    const japanese = await prisma.subject.create({ data: { name: "国語", order: 2 } });
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: FROM,
        periodId: p2.id,
        subjectId: japanese.id,
        format: LESSON_STYLE.INDIV_2,
        required: 1,
      },
    });

    const blocked = await checkPreconditions(plan.id);
    check("P8 で止まる", blocked.some((b) => b.code === "P8"), true);
    check("科目名を出す", blocked.some((b) => b.message.includes("国語")), true);

    // 片付ける
    await prisma.shiftDemand.deleteMany({ where: { subjectId: japanese.id } });
    await prisma.subject.delete({ where: { id: japanese.id } });
  }

  console.log("\n[3] 実行すると割当が保存される");
  {
    const blocked = await checkPreconditions(plan.id);
    check("前提条件は満たされた", blocked, []);

    const out = await runGenerate(plan.id, "FULL");
    check("実行できた", out.ok, true);

    const saved = await prisma.shiftAssignment.findMany({
      where: { planId: plan.id },
      orderBy: { teacherId: "asc" },
    });
    check("2件保存された", saved.length, 2);
    check("科目が入る", [...new Set(saved.map((a) => a.subjectId))], [english.id]);
    check("形態が入る", [...new Set(saved.map((a) => a.format))], [LESSON_STYLE.INDIV_2]);
    check("自動作成として記録", [...new Set(saved.map((a) => a.source))], [
      ASSIGNMENT_SOURCE.AUTO,
    ]);
    check("評価値が入る", saved.every((a) => a.score !== null), true);
    // 数学しか担当できない伊藤は英語に入らない（H12）
    check("担当できない講師は入らない", saved.some((a) => a.teacherId === ito.id), false);
  }

  console.log("\n[4] 実行結果が計画に残る");
  {
    const p = await prisma.shiftPlan.findUniqueOrThrow({ where: { id: plan.id } });
    check("実行日時が入る", p.generatedAt !== null, true);

    const last = parseLastResult(p.lastResult);
    check("結果を読み戻せる", last !== null, true);
    check("必要合計", last?.summary.requiredTotal, 2);
    check("割当合計", last?.summary.placedTotal, 2);
    check("充足率", last?.summary.fillRate, 1);
    check("未充足なし", last?.unfilled.length, 0);
  }

  console.log("\n[5] 作り直しても固定した割当は動かない（H10）");
  {
    // 高橋の割当を固定する
    const target = await prisma.shiftAssignment.findFirstOrThrow({
      where: { planId: plan.id, teacherId: takahashi.id },
    });
    await prisma.shiftAssignment.update({
      where: { id: target.id },
      data: { locked: true, note: "固定した" },
    });

    await runGenerate(plan.id, "FULL");

    const still = await prisma.shiftAssignment.findUnique({ where: { id: target.id } });
    // ID が同じまま残っていること。消して作り直すと note や手修正が消える。
    check("同じ行が残る", still?.id, target.id);
    check("固定のまま", still?.locked, true);
    check("メモも残る", still?.note, "固定した");
    check("全体は2件のまま", await prisma.shiftAssignment.count({ where: { planId: plan.id } }), 2);
  }

  console.log("\n[6] 足りないところだけ埋める（FILL）");
  {
    // 9/2 の1限に英語1人を追加
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: "2026-09-02",
        periodId: p1.id,
        subjectId: english.id,
        format: LESSON_STYLE.INDIV_2,
        required: 1,
      },
    });

    const before = await prisma.shiftAssignment.findMany({
      where: { planId: plan.id },
      orderBy: { id: "asc" },
    });
    await runGenerate(plan.id, "FILL");
    const after = await prisma.shiftAssignment.findMany({
      where: { planId: plan.id },
      orderBy: { id: "asc" },
    });

    check("既存の割当は消えない", after.filter((a) => before.some((b) => b.id === a.id)).length, before.length);
    check("不足ぶんが足される", after.length, before.length + 1);
  }

  console.log("\n[7] 休校日には割り当てない");
  {
    await prisma.schoolEvent.create({
      data: { title: "臨時休校", kind: "CLOSED", startDate: TO, endDate: TO },
    });
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: TO,
        periodId: p1.id,
        subjectId: english.id,
        format: LESSON_STYLE.INDIV_2,
        required: 2,
      },
    });

    await runGenerate(plan.id, "FULL");
    const onClosed = await prisma.shiftAssignment.count({
      where: { planId: plan.id, date: TO },
    });
    check("休校日は0件", onClosed, 0);
  }

  console.log("\n[8] 確定済みの計画は自動作成できない（P7）");
  {
    await prisma.shiftPlan.update({
      where: { id: plan.id },
      data: { status: PLAN_STATUS.CONFIRMED },
    });

    const blocked = await checkPreconditions(plan.id);
    check("P7 で止まる", blocked.some((b) => b.code === "P7"), true);

    const countBefore = await prisma.shiftAssignment.count({ where: { planId: plan.id } });
    const out = await runGenerate(plan.id);
    check("実行できない", out.ok, false);
    check("割当は変わらない", await prisma.shiftAssignment.count({ where: { planId: plan.id } }), countBefore);
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
