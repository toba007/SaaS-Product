"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  bulkSetWeekday,
  clearMonth,
  setShiftRequest,
  toggleAssignment,
} from "@/lib/shifts";
import { parseTermKind, termKindOfDate } from "@/lib/terms";
import { dayOfWeek, monthDays, parseYm } from "@/lib/dates";

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

/** 確定シフトを付ける／外す */
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
