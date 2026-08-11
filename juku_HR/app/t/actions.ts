"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { bulkSetWeekday, setShiftRequest } from "@/lib/shifts";
import { saveRecord, setAttendanceStatus } from "@/lib/cards";
import { canEditLesson } from "@/lib/teacher";
import { currentTeacher } from "@/lib/dal";
import { parseTermKind, termKindOfDate } from "@/lib/terms";
import { dayOfWeek, monthDays, parseYm } from "@/lib/dates";

/**
 * 講師側の書き込みは、誰であるかを必ずセッションから決める。
 * フォームから来た teacherId は信用しない。信用すると、開発者ツールで値を
 * 書き換えるだけで他人のシフト・授業・給与を触れてしまう。
 */

function refresh() {
  revalidatePath("/t");
  // 管理者側にも反映する
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/");
}

/** 自分のシフト希望を1コマ入れる */
export async function submitMyShift(formData: FormData) {
  const teacher = await currentTeacher();
  if (!teacher) return;

  await setShiftRequest(
    teacher.id,
    String(formData.get("date")),
    Number(formData.get("periodId")),
    String(formData.get("status")),
  );
  refresh();
}

/** 自分のシフト希望を曜日でまとめて入れる */
export async function bulkSetMyShifts(formData: FormData) {
  const teacher = await currentTeacher();
  if (!teacher) return;

  const ym = parseYm(String(formData.get("ym")));
  const periodIds = formData.getAll("periodIds").map(Number);
  if (periodIds.length === 0) return;

  // 選んでいるコマタイプの期間内の日にだけ入れる。
  // 夏期講習のコマをレギュラーの日に入れてしまわないようにするため。
  const kind = parseTermKind(String(formData.get("kind")));
  const terms = await prisma.term.findMany();
  const dow = Number(formData.get("dow"));
  const dates = monthDays(ym).filter(
    (d) => dayOfWeek(d) === dow && termKindOfDate(d, terms) === kind,
  );
  if (dates.length === 0) return;

  await bulkSetWeekday(teacher.id, dates, periodIds, String(formData.get("status")));
  refresh();
}

/** 自分が担当した授業の記録を書く */
export async function saveMyLessonRecord(formData: FormData) {
  const teacher = await currentTeacher();
  if (!teacher) return;

  const lessonId = Number(formData.get("lessonId"));
  // 自分が担当していない授業は触らせない
  if (!(await canEditLesson(teacher.id, lessonId))) return;

  await saveRecord(lessonId, {
    progress: String(formData.get("progress") ?? ""),
    homework: String(formData.get("homework") ?? ""),
    note: String(formData.get("note") ?? ""),
  });

  revalidatePath("/t/lessons");
  revalidatePath(`/t/lessons/${lessonId}`);
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/cards");
  revalidatePath("/");
}

/** 自分が担当した授業の出欠をつける */
export async function setMyAttendance(formData: FormData) {
  const teacher = await currentTeacher();
  if (!teacher) return;

  const lessonId = Number(formData.get("lessonId"));
  if (!(await canEditLesson(teacher.id, lessonId))) return;

  await setAttendanceStatus(
    lessonId,
    Number(formData.get("studentId")),
    String(formData.get("status")),
  );

  revalidatePath(`/t/lessons/${lessonId}`);
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/cards");
  revalidatePath("/");
}

/** 連絡を読んだことにする（画面を開いた時点で呼ばれる） */
export async function markRead(teacherId: number, messageId: number) {
  await prisma.messageRecipient.updateMany({
    where: { teacherId, messageId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** アンケートに答える */
export async function answerMySurvey(formData: FormData) {
  const teacher = await currentTeacher();
  if (!teacher) return;

  const messageId = Number(formData.get("messageId"));
  const answer = String(formData.get("answer") ?? "").trim();

  // 自分が受信者になっている連絡にしか書けない（updateMany の where で絞る）
  await prisma.messageRecipient.updateMany({
    where: { teacherId: teacher.id, messageId },
    data: {
      answer: answer || null,
      answeredAt: answer ? new Date() : null,
      readAt: new Date(),
    },
  });

  revalidatePath("/t/messages");
  revalidatePath(`/t/messages/${messageId}`);
  revalidatePath(`/messages/${messageId}`);
  revalidatePath("/");
}

/**
 * カレンダー購読URLを作り直す。
 *
 * URL に入っているトークンが本人確認そのものなので、他人に見られたら
 * その人は本人のシフトを読み続けられる。すぐ切れる手段を本人に持たせておく。
 * 作り直すと前のURLは404になり、購読していたカレンダーからは予定が消える。
 */
export async function regenerateIcsToken() {
  const me = await currentTeacher();
  if (!me) return;

  await prisma.teacher.update({
    where: { id: me.id },
    data: { icsToken: randomUUID().replace(/-/g, "") },
  });

  revalidatePath("/t/schedule");
}
