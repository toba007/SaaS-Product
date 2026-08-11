"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { TERM_KIND_ORDER } from "@/lib/constants";

export type TermState = { error?: string; ok?: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 期（レギュラー／夏期講習など）の登録は、今まで seed でしか作れなかった。
 *
 * ここで決めた期間は、カレンダーの背景だけでなく次のものに効く。
 *   - 交通費（通常期は定期券あり、講習期間は定期券なしの単価）
 *   - 講師のシフト希望のコマタイプ（期ごとにコマの時間帯が違う）
 * 見た目の設定ではないので、消すときは影響を伝える。
 */
function refresh() {
  revalidatePath("/calendar/terms");
  revalidatePath("/calendar");
  revalidatePath("/shifts");
  revalidatePath("/payroll");
  revalidatePath("/t");
  revalidatePath("/");
}

export async function addTerm(
  _prev: TermState,
  formData: FormData,
): Promise<TermState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = TERM_KIND_ORDER.includes(kindRaw) ? kindRaw : "REGULAR";
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (!name) return { error: "期の名前を入れてください" };
  if (!DATE.test(startDate) || !DATE.test(endDate)) {
    return { error: "開始日と終了日を入れてください" };
  }
  if (endDate < startDate) {
    return { error: "終了日が開始日より前になっています" };
  }

  // 期間が重なると、その日がどの期かを決められない。
  // termKindOfDate() は最初に見つかったものを返すので、静かに片方が無視される。
  const overlap = await prisma.term.findFirst({
    where: { endDate: { gte: startDate }, startDate: { lte: endDate } },
  });
  if (overlap) {
    return {
      error: `「${overlap.name}」(${overlap.startDate}〜${overlap.endDate}) と期間が重なっています`,
    };
  }

  await prisma.term.create({ data: { name, kind, startDate, endDate } });
  refresh();
  return { ok: true };
}

export async function deleteTerm(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  // シフト希望や確定シフトが期を参照している。消しても記録は残るが、
  // その日の交通費とコマタイプの判定は「通常期」に戻る。
  await prisma.term.delete({ where: { id } });
  refresh();
}
