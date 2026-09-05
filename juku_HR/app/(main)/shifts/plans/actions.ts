"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { excludeClosed } from "@/lib/events";
import {
  confirmPlan as confirm,
  reopenPlan as reopen,
  runGenerate,
} from "@/lib/shifts-plan";
import { datesBetween, dayOfWeek } from "@/lib/dates";
import { LESSON_STYLE, PLAN_STATUS } from "@/lib/constants";
import { activeClasses, groupDemand } from "@/lib/classes";
import { individualDemand, mergeDemand } from "@/lib/schedule";
import { subjectKey } from "@/lib/subjects";
import { getSetting } from "@/lib/settings";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type PlanState = { error?: string };

/** シフト計画を作る。需要も割当もこの計画にぶら下がる。 */
export async function createShiftPlan(
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");

  if (!name) return { error: "名前を入力してください" };
  if (!ISO.test(fromDate) || !ISO.test(toDate)) {
    return { error: "日付を入力してください" };
  }
  if (fromDate > toDate) return { error: "終了日が開始日より前になっています" };

  const plan = await prisma.shiftPlan.create({
    data: { name, fromDate, toDate },
  });

  revalidatePath("/shifts/plans");
  redirect(`/shifts/plans/${plan.id}`);
}

/**
 * 曜日を指定して、必要人数をまとめて入れる。
 *
 * 1か月ぶんを1日ずつ入力させると、30日 × 3コマ × 5科目 で450マスになる。
 * 塾の必要人数はたいてい曜日で決まっているので、シフト希望の一括入力と同じ形にする。
 */
export async function bulkSetDemand(formData: FormData) {
  await requireAdmin();

  const planId = Number(formData.get("planId"));
  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  // 確定後に需要を変えると、確定済みのシフトと辻褄が合わなくなる
  if (plan.status !== PLAN_STATUS.DRAFT) return;

  const dow = Number(formData.get("dayOfWeek"));
  const periodId = Number(formData.get("periodId"));
  const subjectId = Number(formData.get("subjectId"));
  const format = String(formData.get("format") ?? LESSON_STYLE.INDIV_2);
  const required = Number(formData.get("required"));

  if (!Number.isInteger(dow) || dow < 0 || dow > 6) return;
  if (!Number.isInteger(required) || required < 0 || required > 99) return;

  // フォームの値は書き換えられるので、実在するかを毎回確かめる
  const [period, subject] = await Promise.all([
    prisma.period.findUnique({ where: { id: periodId }, select: { id: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
  ]);
  if (!period || !subject) return;

  // 休校日には需要を作らない。作ると「必要なのに誰も入れない」コマになる。
  const days = await excludeClosed(
    datesBetween(plan.fromDate, plan.toDate).filter((d) => dayOfWeek(d) === dow),
  );

  // 手入力は科目1つぶんの需要。科目の集合は要素1つになる。
  const subjectIds = subjectKey([subjectId]);

  for (const date of days) {
    const key = {
      planId_date_periodId_subjectIds_format: {
        planId,
        date,
        periodId,
        subjectIds,
        format,
      },
    };
    if (required === 0) {
      // 0 は「授業を開かない」。行を消して表す（0 の行が残ると一覧が読みにくい）
      await prisma.shiftDemand.deleteMany({
        where: { planId, date, periodId, subjectIds, format },
      });
      continue;
    }
    await prisma.shiftDemand.upsert({
      where: key,
      create: { planId, date, periodId, subjectId, subjectIds, format, required },
      update: { required },
    });
  }

  revalidatePath(`/shifts/plans/${planId}`);
}

/**
 * 自動作成を実行する。
 *
 * 前提条件を満たさない場合は理由を出して止める（中途半端な結果を出さない）。
 * 実行は1トランザクションなので、途中で失敗しても実行前の状態に戻る。
 */
export async function generateShiftPlan(formData: FormData) {
  await requireAdmin();

  const planId = Number(formData.get("planId"));
  if (!Number.isInteger(planId)) return;

  const mode = String(formData.get("mode")) === "FILL" ? "FILL" : "FULL";
  await runGenerate(planId, mode);

  revalidatePath(`/shifts/plans/${planId}`);
  revalidatePath("/shifts/board");
  revalidatePath("/shifts/plans");
}

/**
 * 確定する。ここから講師に見えるようになる。
 * 未充足などの警告があっても確定はできる（止めるのではなく、画面で知らせる）。
 */
export async function confirmPlan(formData: FormData) {
  const admin = await requireAdmin();
  const planId = Number(formData.get("planId"));
  if (!Number.isInteger(planId)) return;

  await confirm(planId, admin.id);

  revalidatePath(`/shifts/plans/${planId}`);
  revalidatePath("/shifts/plans");
  // 講師側の表示が変わる
  revalidatePath("/t");
  revalidatePath("/t/schedule");
}

/** 確定を解除して下書きに戻す。理由は必須。 */
export async function reopenPlan(formData: FormData) {
  const admin = await requireAdmin();
  const planId = Number(formData.get("planId"));
  const reason = String(formData.get("reason") ?? "");
  if (!Number.isInteger(planId)) return;

  await reopen(planId, admin.id, reason);

  revalidatePath(`/shifts/plans/${planId}`);
  revalidatePath("/shifts/plans");
  revalidatePath("/t");
  revalidatePath("/t/schedule");
}

/** 需要をまとめて消す（入れ直したいとき用） */
export async function clearDemand(formData: FormData) {
  await requireAdmin();

  const planId = Number(formData.get("planId"));
  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== PLAN_STATUS.DRAFT) return;

  await prisma.shiftDemand.deleteMany({ where: { planId } });
  revalidatePath(`/shifts/plans/${planId}`);
}


/**
 * 受講予定から必要人数を作る（段階1）。
 *
 * これまでは管理者が「火曜2限は英語2人」と手で入れていたが、
 * **その情報は既にある。** クラスが立っていて、個別の配置が入っていれば数えれば出る。
 *
 * ---- 上書きの範囲を限る ----
 * 手で入れた行まで消すと、自動で出せない事情（特別対応など）が消える。
 * ここでは**計算で出た枠だけ**を書き換え、それ以外の行はそのまま残す。
 * 「全部作り直したい」ときは、先に「必要人数をすべて消す」を使う。
 */
export async function buildDemandFromPlans(formData: FormData) {
  await requireAdmin();

  const planId = Number(formData.get("planId"));
  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  // 確定後に需要を変えると、確定済みのシフトと辻褄が合わなくなる
  if (plan.status !== PLAN_STATUS.DRAFT) return;

  const [classGroups, sessions, links, schedules, setting] = await Promise.all([
    prisma.classGroup.findMany(),
    prisma.classSession.findMany(),
    prisma.studentSubject.findMany({ where: { active: true } }),
    prisma.studentSchedule.findMany(),
    getSetting(),
  ]);

  // 休校日には需要を作らない。作ると「必要なのに誰も入れない」コマになる。
  const days = await excludeClosed(datesBetween(plan.fromDate, plan.toDate));

  const rows = mergeDemand(
    // 集団は1クラス＝1科目なので、科目の集合は要素1つ
    groupDemand(
      activeClasses(classGroups, plan.fromDate, plan.toDate),
      sessions,
      days,
    ).map((d) => ({
      ...d,
      subjectIds: subjectKey([d.subjectId]),
      format: LESSON_STYLE.GROUP,
    })),
    individualDemand(links, schedules, days, setting.indivMaxStudents),
  );

  await prisma.$transaction(
    rows.map((r) =>
      prisma.shiftDemand.upsert({
        where: {
          planId_date_periodId_subjectIds_format: {
            planId,
            date: r.date,
            periodId: r.periodId,
            subjectIds: r.subjectIds,
            format: r.format,
          },
        },
        create: { planId, ...r },
        update: { required: r.required },
      }),
    ),
  );

  revalidatePath(`/shifts/plans/${planId}`);
}
