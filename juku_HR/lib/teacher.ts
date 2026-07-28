import { prisma } from "./prisma";

/**
 * 講師側の画面（/t）の細かい認可。
 * 「誰であるか」はセッションから決める（lib/dal.ts の currentTeacher）。
 * ここでは「その人がこの対象を触ってよいか」だけを判定する。
 */

/** その講師がこの授業を触ってよいか（自分が担当した授業だけ） */
export async function canEditLesson(
  teacherId: number,
  lessonId: number,
): Promise<boolean> {
  if (!Number.isInteger(lessonId)) return false;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { teacherId: true },
  });
  return lesson?.teacherId === teacherId;
}

/** その講師がこの連絡を見てよいか（自分が受信者になっているものだけ） */
export async function canReadMessage(
  teacherId: number,
  messageId: number,
): Promise<boolean> {
  if (!Number.isInteger(messageId)) return false;
  const r = await prisma.messageRecipient.findUnique({
    where: { messageId_teacherId: { messageId, teacherId } },
    select: { id: true },
  });
  return r !== null;
}
