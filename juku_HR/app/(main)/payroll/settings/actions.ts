"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";

export type SaveState = { savedId?: number; error?: string };

function toYen(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * 1人ぶんの単価を保存する。
 *
 * 項目は管理者が作るものなので、どの項目が来るかは決め打ちできない。
 * フォームに入っている rate_<項目id> を全部見る。
 * 空欄は 0 ではなく「未設定」。行ごと消して、設定漏れと 0 円を区別する。
 */
export async function saveWages(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAdmin();

  const teacherId = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) return { error: "講師が見つかりません" };

  const items = await prisma.payItem.findMany({
    where: { active: true },
    select: { id: true },
  });

  for (const item of items) {
    const amount = toYen(formData.get(`rate_${item.id}`));
    if (amount === null) {
      await prisma.teacherPayRate.deleteMany({
        where: { teacherId, payItemId: item.id },
      });
      continue;
    }
    await prisma.teacherPayRate.upsert({
      where: { teacherId_payItemId: { teacherId, payItemId: item.id } },
      create: { teacherId, payItemId: item.id, amount },
      update: { amount },
    });
  }

  revalidatePath("/payroll/settings");
  revalidatePath("/payroll");
  revalidatePath("/t/payslip");
  return { savedId: teacherId };
}
