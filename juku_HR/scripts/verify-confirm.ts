/**
 * 確定と、講師への見え方を確かめる。
 *   npm run verify
 *
 * この機能でいちばん事故になりやすいのが「確定していない予定が講師に見えること」。
 * 検討中のシフトで人が動いてしまうと、当日になって誰も来ない。
 * 講師側の画面が使っているのと同じ条件で引いて、見えないことを確かめる。
 */
import { prisma } from "../lib/prisma";
import {
  confirmPlan,
  confirmWarnings,
  reopenPlan,
  runGenerate,
} from "../lib/shifts-plan";
import { LESSON_STYLE, PLAN_STATUS, SHIFT } from "../lib/constants";
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

const FROM = "2026-10-01";
const TO = "2026-10-02";

/**
 * 講師側の画面と同じ条件で「その講師に見える割当」を引く。
 * app/t/schedule/page.tsx の where と揃えてある。ここがずれたら意味がない。
 */
async function visibleToTeacher(teacherId: number) {
  return prisma.shiftAssignment.findMany({
    where: {
      teacherId,
      date: { gte: FROM, lte: TO },
      OR: [{ planId: null }, { plan: { status: PLAN_STATUS.CONFIRMED } }],
    },
  });
}

async function main() {
  await resetAll();

  const english = await prisma.subject.create({ data: { name: "英語", order: 0 } });
  const p1 = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const admin = await prisma.teacher.create({
    data: { name: "佐藤 健一", loginId: "c-sato", passwordHash: "x", role: "ADMIN" },
  });
  const takahashi = await prisma.teacher.create({
    data: {
      name: "高橋 涼",
      loginId: "c-takahashi",
      passwordHash: "x",
      subjects: { create: [{ subjectId: english.id, level: 3 }] },
    },
  });

  const plan = await prisma.shiftPlan.create({
    data: { name: "10月", fromDate: FROM, toDate: TO },
  });

  for (const d of [FROM, TO]) {
    await prisma.shiftRequest.create({
      data: { teacherId: takahashi.id, date: d, periodId: p1.id, status: SHIFT.OK },
    });
  }
  await prisma.shiftDemand.create({
    data: {
      planId: plan.id,
      date: FROM,
      periodId: p1.id,
      subjectId: english.id,
      format: LESSON_STYLE.INDIV_2,
      required: 1,
    },
  });

  console.log("\n[1] 下書きのうちは講師に見えない");
  {
    const out = await runGenerate(plan.id, "FULL");
    check("自動作成できた", out.ok, true);
    check("割当は保存されている", await prisma.shiftAssignment.count({ where: { planId: plan.id } }), 1);
    // ここが要。保存されていても、講師の画面には出てはいけない。
    check("講師には見えない", (await visibleToTeacher(takahashi.id)).length, 0);
  }

  console.log("\n[2] 確定すると講師に見える");
  {
    const ok = await confirmPlan(plan.id, admin.id);
    check("確定できた", ok, true);

    const p = await prisma.shiftPlan.findUniqueOrThrow({ where: { id: plan.id } });
    check("状態が確定になる", p.status, PLAN_STATUS.CONFIRMED);
    check("確定日時が入る", p.confirmedAt !== null, true);
    check("誰が確定したか残る", p.confirmedById, admin.id);

    check("講師に見える", (await visibleToTeacher(takahashi.id)).length, 1);
  }

  console.log("\n[3] 確定済みは二重に確定できない");
  {
    const again = await confirmPlan(plan.id, admin.id);
    check("2度目は何もしない", again, false);
  }

  console.log("\n[4] 確定を解除すると、また見えなくなる");
  {
    const noReason = await reopenPlan(plan.id, admin.id, "   ");
    // 黙って戻せると、講師が見た予定と実際がずれた理由が分からなくなる
    check("理由が空なら解除できない", noReason, false);
    check("確定のまま", (await prisma.shiftPlan.findUniqueOrThrow({ where: { id: plan.id } })).status, PLAN_STATUS.CONFIRMED);

    const ok = await reopenPlan(plan.id, admin.id, "高橋先生の急な予定変更のため");
    check("理由があれば解除できる", ok, true);

    const p = await prisma.shiftPlan.findUniqueOrThrow({ where: { id: plan.id } });
    check("下書きに戻る", p.status, PLAN_STATUS.DRAFT);
    check("誰が解除したか残る", p.reopenedById, admin.id);
    check("理由が残る", p.reopenReason, "高橋先生の急な予定変更のため");
    check("解除日時が残る", p.reopenedAt !== null, true);

    check("講師から見えなくなる", (await visibleToTeacher(takahashi.id)).length, 0);
    // 割当そのものは消さない。消すと手直しの内容まで失われる。
    check("割当は残っている", await prisma.shiftAssignment.count({ where: { planId: plan.id } }), 1);
  }

  console.log("\n[5] 下書きでないものは解除できない");
  {
    const again = await reopenPlan(plan.id, admin.id, "理由");
    check("下書きを解除しようとしても何もしない", again, false);
  }

  console.log("\n[6] 計画に属さない手入力の割当は、従来どおり見える");
  {
    // planId が null の割当は昔からある形。確定の概念が無いので隠さない。
    await prisma.shiftAssignment.create({
      data: { teacherId: takahashi.id, date: TO, periodId: p1.id },
    });
    check("見える", (await visibleToTeacher(takahashi.id)).length, 1);
  }

  console.log("\n[7] 確定前に、そのまま公開すると何が起きるかを知らせる");
  {
    // 需要を増やして未充足を作る
    await prisma.shiftDemand.create({
      data: {
        planId: plan.id,
        date: TO,
        periodId: p1.id,
        subjectId: english.id,
        format: LESSON_STYLE.INDIV_2,
        required: 3,
      },
    });
    const w = await confirmWarnings(plan.id);
    check("未充足を知らせる", w.some((x) => x.code === "UNFILLED"), true);

    // 警告があっても確定はできる。当日の欠員など、埋まらないまま確定せざるを得ない状況はある。
    const ok = await confirmPlan(plan.id, admin.id);
    check("警告があっても確定できる", ok, true);
  }

  console.log("\n[8] 「出られない」への割当も知らせる");
  {
    await reopenPlan(plan.id, admin.id, "検証のため");
    await prisma.shiftRequest.updateMany({
      where: { teacherId: takahashi.id, date: FROM, periodId: p1.id },
      data: { status: SHIFT.NG },
    });

    const w = await confirmWarnings(plan.id);
    check("NG への割当を知らせる", w.some((x) => x.code === "NG_ASSIGNED"), true);
  }

  console.log("\n[9] 休校日に残った割当も知らせる");
  {
    await prisma.schoolEvent.create({
      data: { title: "臨時休校", kind: "CLOSED", startDate: FROM, endDate: FROM },
    });
    const w = await confirmWarnings(plan.id);
    check("休校日の割当を知らせる", w.some((x) => x.code === "CLOSED_ASSIGNED"), true);
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
