"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  bulkSetWeekday,
  clearMonth,
  setShiftRequest,
  toggleAssignment,
} from "@/lib/shifts";
import { requireAdmin } from "@/lib/dal";
import { eventsBetween, isClosed } from "@/lib/events";
import { buildContext, checkAdd, isAllowed } from "@/lib/shifts-rules";
import { parseTermKind, termKindOfDate } from "@/lib/terms";
import { dayOfWeek, monthDays, parseYm, weekDays } from "@/lib/dates";
import { ASSIGNMENT_SOURCE, DEFAULT_SHIFT_RULE } from "@/lib/constants";

/** 講師のシフト希望を1コマ入れる（同じものを再度押すと取り消し） */
export async function submitShiftRequest(formData: FormData) {
  await setShiftRequest(
    Number(formData.get("teacherId")),
    String(formData.get("date")),
    Number(formData.get("periodId")),
    String(formData.get("status")),
  );
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/");
}

/**
 * 「毎週◯曜のこのコマは出られる」をその月ぶんまとめて入れる。
 * 選んでいるコマタイプの期間内の日にだけ入れる（夏期講習のコマをレギュラーの日に入れない）。
 */
export async function bulkSetShiftRequests(formData: FormData) {
  const teacherId = Number(formData.get("teacherId"));
  const ym = parseYm(String(formData.get("ym")));
  const dow = Number(formData.get("dow"));
  const status = String(formData.get("status"));
  const periodIds = formData.getAll("periodIds").map(Number);
  if (periodIds.length === 0) return;

  const dates = await datesOfKind(ym, formData, (d) => dayOfWeek(d) === dow);
  if (dates.length > 0) {
    await bulkSetWeekday(teacherId, dates, periodIds, status);
  }

  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/t");
}

/** その月の、そのコマタイプの期間ぶんの希望を消す */
export async function clearMonthRequests(formData: FormData) {
  const teacherId = Number(formData.get("teacherId"));
  const ym = parseYm(String(formData.get("ym")));
  const dates = await datesOfKind(ym, formData);
  await clearMonth(teacherId, dates);

  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/t");
}

/** その月の、選んでいるコマタイプに当たる日を返す */
async function datesOfKind(
  ym: ReturnType<typeof parseYm>,
  formData: FormData,
  extra: (d: string) => boolean = () => true,
) {
  const kind = parseTermKind(String(formData.get("kind")));
  const terms = await prisma.term.findMany();
  return monthDays(ym).filter(
    (d) => termKindOfDate(d, terms) === kind && extra(d),
  );
}

/** 確定シフトを付ける／外す（科目を持たない旧来の操作） */
export async function toggleShiftAssignment(formData: FormData) {
  await toggleAssignment(
    Number(formData.get("teacherId")),
    String(formData.get("date")),
    Number(formData.get("periodId")),
  );
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/");
}

/**
 * 盤面のマスを押したときの動作。
 *   未割当 → 割当 → 固定 → 未割当
 *
 * 勤怠のコマや担当科目のマスと同じ「押すたびに回る」操作にしてある。
 * 割当に科目が必要になったので、盤面は科目を1つ選んだ状態のビューにして、
 * 押したマスにはその科目を入れる（選択肢を開かせない）。
 *
 * 既に別の科目で入っている場合は何もしない。同じコマで2科目は持てないので（H13）、
 * 黙って科目を書き換えると、その講師が別の教科の枠から消えたことに気づけない。
 */
export async function cycleAssignment(formData: FormData) {
  const admin = await requireAdmin();

  const teacherId = Number(formData.get("teacherId"));
  const date = String(formData.get("date"));
  const periodId = Number(formData.get("periodId"));
  const subjectId = Number(formData.get("subjectId"));
  if (
    !Number.isInteger(teacherId) ||
    !Number.isInteger(periodId) ||
    !Number.isInteger(subjectId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return;
  }

  const key = { teacherId_date_periodId: { teacherId, date, periodId } };
  const existing = await prisma.shiftAssignment.findUnique({ where: key });

  // 別の科目で入っている → 触らない
  if (existing && existing.subjectId !== null && existing.subjectId !== subjectId) {
    return;
  }

  if (existing) {
    if (!existing.locked) {
      // 割当 → 固定
      await prisma.shiftAssignment.update({
        where: key,
        data: { locked: true, subjectId },
      });
    } else {
      // 固定 → 未割当。外すのは常に許す（休校が後から決まった場合の後始末）。
      await prisma.shiftAssignment.delete({ where: key });
    }
  } else {
    // 未割当 → 割当。手修正なので manual モードで判定する。
    const violations = await checkManualAdd({ teacherId, date, periodId, subjectId });
    if (!isAllowed(violations)) return;

    const plan = await prisma.shiftPlan.findFirst({
      where: { fromDate: { lte: date }, toDate: { gte: date } },
      orderBy: [{ status: "asc" }, { id: "desc" }],
    });

    await prisma.shiftAssignment.create({
      data: {
        teacherId,
        date,
        periodId,
        subjectId,
        planId: plan?.id ?? null,
        source: ASSIGNMENT_SOURCE.MANUAL,
        note: `${admin.name} が手で追加`,
      },
    });
  }

  revalidatePath("/shifts/board");
  revalidatePath("/shifts");
  revalidatePath("/");
}

/**
 * 手で足すときのハード制約チェック。
 * 画面で押せなくするだけでは足りない（フォームの値は書き換えられる）ので、
 * 書き込む側でも必ず通す。
 */
async function checkManualAdd(cand: {
  teacherId: number;
  date: string;
  periodId: number;
  subjectId: number;
}) {
  const week = weekDays(cand.date);
  const [from, to] = [week[0], week[6]];

  const [teachers, periods, requests, assignments, events, links, rules, demands] =
    await Promise.all([
      prisma.teacher.findMany(),
      prisma.period.findMany(),
      prisma.shiftRequest.findMany({ where: { date: { gte: from, lte: to } } }),
      prisma.shiftAssignment.findMany({ where: { date: { gte: from, lte: to } } }),
      eventsBetween(from, to),
      prisma.teacherSubject.findMany(),
      prisma.teacherShiftRule.findMany(),
      prisma.shiftDemand.findMany({ where: { date: { gte: from, lte: to } } }),
    ]);

  const ruleOf = new Map(rules.map((r) => [r.teacherId, r]));
  const subjectsOf = new Map<number, Set<number>>();
  for (const l of links) {
    const set = subjectsOf.get(l.teacherId) ?? new Set<number>();
    set.add(l.subjectId);
    subjectsOf.set(l.teacherId, set);
  }

  const ctx = buildContext({
    teachers: teachers.map((t) => {
      const r = ruleOf.get(t.id);
      return {
        id: t.id,
        name: t.name,
        active: t.active,
        rule: {
          maxPerDay: r?.maxPerDay ?? DEFAULT_SHIFT_RULE.maxPerDay,
          maxPerWeek: r?.maxPerWeek ?? DEFAULT_SHIFT_RULE.maxPerWeek,
          maxConsecutive: r?.maxConsecutive ?? DEFAULT_SHIFT_RULE.maxConsecutive,
          minPerWeek: r?.minPerWeek ?? DEFAULT_SHIFT_RULE.minPerWeek,
        },
        subjects: subjectsOf.get(t.id) ?? new Set<number>(),
      };
    }),
    periods: periods.map((p) => ({
      id: p.id,
      order: p.order,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    requests,
    closedDates: week.filter((d) => isClosed(d, events)),
    demands,
    assignments: assignments.map((a) => ({
      teacherId: a.teacherId,
      date: a.date,
      periodId: a.periodId,
      subjectId: a.subjectId,
    })),
  });

  return checkAdd(ctx, cand, "manual");
}
