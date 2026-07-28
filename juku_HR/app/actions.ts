"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { saveRecord, setAttendanceStatus } from "@/lib/cards";
import { CARD_STATUS } from "@/lib/constants";

function revalidateAll(lessonId?: number) {
  if (lessonId) revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/lessons");
  revalidatePath("/cards");
  revalidatePath("/");
}

/** 授業記録（進んだ内容・宿題）を保存する */
export async function saveLessonRecord(formData: FormData) {
  const lessonId = Number(formData.get("lessonId"));
  await saveRecord(lessonId, {
    progress: String(formData.get("progress") ?? ""),
    homework: String(formData.get("homework") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidateAll(lessonId);
}

/** 出欠を1件切り替える */
export async function setAttendance(formData: FormData) {
  const lessonId = Number(formData.get("lessonId"));
  await setAttendanceStatus(
    lessonId,
    Number(formData.get("studentId")),
    String(formData.get("status")),
  );
  revalidateAll(lessonId);
}

/** カードの内容（生徒ごとのひとこと等）を保存する */
export async function updateCard(formData: FormData) {
  const id = Number(formData.get("cardId"));
  const markReady = formData.get("markReady") === "1";

  const card = await prisma.absenceCard.findUnique({ where: { id } });
  if (!card) return;

  await prisma.absenceCard.update({
    where: { id },
    data: {
      progress: String(formData.get("progress") ?? ""),
      homework: String(formData.get("homework") ?? ""),
      comment: String(formData.get("comment") ?? ""),
      status:
        markReady && card.status === CARD_STATUS.DRAFT
          ? CARD_STATUS.READY
          : card.status,
    },
  });

  revalidatePath(`/cards/${id}`);
  revalidateAll(card.lessonId);
}

/** 生徒に渡した／取り消す */
export async function toggleDelivered(formData: FormData) {
  const id = Number(formData.get("cardId"));
  const card = await prisma.absenceCard.findUnique({ where: { id } });
  if (!card) return;

  const nowDelivered = card.status === CARD_STATUS.DELIVERED;
  await prisma.absenceCard.update({
    where: { id },
    data: {
      status: nowDelivered ? CARD_STATUS.READY : CARD_STATUS.DELIVERED,
      deliveredAt: nowDelivered ? null : new Date(),
    },
  });

  revalidatePath(`/cards/${id}`);
  revalidateAll(card.lessonId);
}
