"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { LESSON_STYLE_ORDER } from "@/lib/constants";

export type SaveState = { savedId?: number; error?: string };

function toYen(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * 1人ぶんの給与設定を保存する。
 * コマ給は授業形態ごと。空欄にすると「未設定」に戻す（0円とは区別する）。
 */
export async function saveWages(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAdmin();

  const teacherId = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) return { error: "講師が見つかりません" };

  const hourlyWage = toYen(formData.get("hourlyWage"));
  const commuteRegular = toYen(formData.get("commuteRegular"));
  const commuteSpot = toYen(formData.get("commuteSpot"));

  await prisma.teacher.update({
    where: { id: teacherId },
    data: {
      hourlyWage: hourlyWage ?? 0,
      commuteRegular: commuteRegular ?? 0,
      commuteSpot: commuteSpot ?? 0,
    },
  });

  for (const style of LESSON_STYLE_ORDER) {
    const amount = toYen(formData.get(`rate_${style}`));
    if (amount === null) {
      // 空欄 = その形態は担当しない。行ごと消して「未設定」に戻す。
      await prisma.wageRate.deleteMany({ where: { teacherId, style } });
      continue;
    }
    await prisma.wageRate.upsert({
      where: { teacherId_style: { teacherId, style } },
      create: { teacherId, style, amount },
      update: { amount },
    });
  }

  revalidatePath("/payroll/settings");
  revalidatePath("/payroll");
  revalidatePath("/t/payslip");
  return { savedId: teacherId };
}
