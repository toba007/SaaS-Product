"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { LESSON_STYLE } from "@/lib/constants";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath("/students/schedule");
  revalidatePath("/students/subjects");
  // 必要人数の計算がここに依存している
  revalidatePath("/shifts/plans");
}

/** 週に何コマ受けるか（量）。ここが 0 のままだと配置のしようが無い。 */
export async function setSlotsPerWeek(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("studentSubjectId"));
  const slots = Number(formData.get("slotsPerWeek"));
  if (!Number.isInteger(slots) || slots < 0 || slots > 20) return refresh();

  const link = await prisma.studentSubject.findUnique({
    where: { id },
    select: { id: true, format: true },
  });
  if (!link) return refresh();
  // 集団はクラスの時間割で決まるので、ここでは扱わない
  if (link.format === LESSON_STYLE.GROUP) return refresh();

  await prisma.studentSubject.update({
    where: { id },
    data: { slotsPerWeek: slots },
  });
  return refresh();
}

/**
 * 配置を1つ増やす（「田中さんは毎週火曜2限に英語」）。
 *
 * **これは決めた結果を記録するもの。** 担当できる講師がいつ来られるかを見て、
 * 人が決めたものをここに入れる。同じ枠に二重に入れることはできない。
 */
export async function addSchedule(formData: FormData) {
  await requireAdmin();

  const studentSubjectId = Number(formData.get("studentSubjectId"));
  const periodId = Number(formData.get("periodId"));
  const dow = Number(formData.get("dayOfWeek"));
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");

  if (!Number.isInteger(dow) || dow < 0 || dow > 6) return refresh();
  if (!ISO.test(fromDate) || !ISO.test(toDate) || fromDate > toDate) return refresh();

  const [link, period] = await Promise.all([
    prisma.studentSubject.findUnique({
      where: { id: studentSubjectId },
      select: { id: true, format: true },
    }),
    prisma.period.findUnique({ where: { id: periodId }, select: { id: true } }),
  ]);
  if (!link || !period) return refresh();
  if (link.format === LESSON_STYLE.GROUP) return refresh();

  // 同じ科目を同じ曜日・同じコマに2回入れる意味は無い
  const dup = await prisma.studentSchedule.findFirst({
    where: { studentSubjectId, dayOfWeek: dow, periodId, fromDate, toDate },
    select: { id: true },
  });
  if (dup) return refresh();

  await prisma.studentSchedule.create({
    data: { studentSubjectId, dayOfWeek: dow, periodId, fromDate, toDate },
  });
  return refresh();
}

/** 配置を外す。まだ実績にはなっていないので、消してよい。 */
export async function removeSchedule(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await prisma.studentSchedule.deleteMany({ where: { id } });
  return refresh();
}
