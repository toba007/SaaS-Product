"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { EVENT_KIND } from "@/lib/constants";

export type EventState = { error?: string };

function refresh() {
  revalidatePath("/calendar");
  // 講師側のカレンダーにも出るので、そちらも作り直す
  revalidatePath("/t");
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/attendance");
  revalidatePath("/");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 塾の予定を追加する。1日でも期間でも同じ形。 */
export async function addEvent(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const kind = String(formData.get("kind") ?? EVENT_KIND.EVENT);
  const note = String(formData.get("note") ?? "").trim();

  if (!title) return { error: "予定の名前を入れてください" };
  if (!DATE.test(startDate)) return { error: "開始日を入れてください" };

  // 終了日を空にしたら1日だけの予定
  const endDate = endRaw === "" ? startDate : endRaw;
  if (!DATE.test(endDate)) return { error: "終了日の形式が正しくありません" };
  if (endDate < startDate) return { error: "終了日が開始日より前になっています" };

  await prisma.schoolEvent.create({
    data: { title, startDate, endDate, kind, note },
  });

  refresh();
  return {};
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  await prisma.schoolEvent.delete({ where: { id: Number(formData.get("id")) } });
  refresh();
}
