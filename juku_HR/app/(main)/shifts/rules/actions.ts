"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { DEFAULT_SHIFT_RULE } from "@/lib/constants";

/** 数値欄を読む。範囲外や空欄は既定値に戻す。 */
function toCount(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < 0 || n > 99) return fallback;
  return n;
}

/**
 * 1人ぶんの勤務上限を保存する。
 *
 * 上限が無いと、公平性だけを見て1人に詰め込む解が出る。
 * 講師本人には変えさせない（自分の上限を上げれば多く入れてしまう）。
 */
export async function saveShiftRule(formData: FormData) {
  await requireAdmin();

  const teacherId = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!teacher) return;

  const data = {
    maxPerDay: toCount(formData.get("maxPerDay"), DEFAULT_SHIFT_RULE.maxPerDay),
    maxPerWeek: toCount(formData.get("maxPerWeek"), DEFAULT_SHIFT_RULE.maxPerWeek),
    maxConsecutive: toCount(
      formData.get("maxConsecutive"),
      DEFAULT_SHIFT_RULE.maxConsecutive,
    ),
    minPerWeek: toCount(formData.get("minPerWeek"), DEFAULT_SHIFT_RULE.minPerWeek),
  };

  await prisma.teacherShiftRule.upsert({
    where: { teacherId },
    create: { teacherId, ...data },
    update: data,
  });

  revalidatePath("/shifts/rules");
}

/** 既定値に戻す（行を消す） */
export async function resetShiftRule(formData: FormData) {
  await requireAdmin();
  const teacherId = Number(formData.get("teacherId"));
  await prisma.teacherShiftRule.deleteMany({ where: { teacherId } });
  revalidatePath("/shifts/rules");
}
