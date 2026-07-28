import { prisma } from "./prisma";
import { CARD_STATUS, NEEDS_CARD } from "./constants";

/**
 * 授業の出欠にあわせて欠席者カードを作り直す。
 * - 欠席者にカードが無ければ、授業記録の内容を写して作る
 * - 欠席でなくなった生徒のカードは消す（ただし受渡済のものは履歴として残す）
 */
export async function syncCardsForLesson(lessonId: number) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { record: true, attendances: true, cards: true },
  });
  if (!lesson) return;

  const absentIds = lesson.attendances
    .filter((a) => NEEDS_CARD.includes(a.status))
    .map((a) => a.studentId);

  const toCreate = absentIds.filter(
    (sid) => !lesson.cards.some((c) => c.studentId === sid),
  );
  if (toCreate.length > 0) {
    await prisma.absenceCard.createMany({
      data: toCreate.map((studentId) => ({
        lessonId,
        studentId,
        teacherId: lesson.teacherId,
        progress: lesson.record?.progress ?? "",
        homework: lesson.record?.homework ?? "",
      })),
    });
  }

  const toDelete = lesson.cards.filter(
    (c) => !absentIds.includes(c.studentId) && c.status !== CARD_STATUS.DELIVERED,
  );
  if (toDelete.length > 0) {
    await prisma.absenceCard.deleteMany({
      where: { id: { in: toDelete.map((c) => c.id) } },
    });
  }
}

/**
 * 授業記録（進んだ内容・宿題）を保存し、欠席者カードに反映する。
 * 集団授業なら欠席者全員に同じ内容が入るので、ここで1回書けば済む。
 *
 * すでに講師がカード側を書き換えていた場合（個別指導で生徒ごとに内容が違うケース）は
 * 上書きしない。判定は「保存前の授業記録と同じ内容のままか」で行う。
 * 受渡済のカードは渡した時点の控えなので、常に触らない。
 */
export async function saveRecord(
  lessonId: number,
  input: { progress: string; homework: string; note: string },
) {
  const before = await prisma.lessonRecord.findUnique({ where: { lessonId } });

  await prisma.lessonRecord.upsert({
    where: { lessonId },
    create: { lessonId, ...input },
    update: input,
  });

  const cards = await prisma.absenceCard.findMany({
    where: { lessonId, status: { not: CARD_STATUS.DELIVERED } },
  });
  for (const card of cards) {
    const data: { progress?: string; homework?: string } = {};
    if (card.progress === (before?.progress ?? "")) data.progress = input.progress;
    if (card.homework === (before?.homework ?? "")) data.homework = input.homework;
    if (Object.keys(data).length > 0) {
      await prisma.absenceCard.update({ where: { id: card.id }, data });
    }
  }

  await syncCardsForLesson(lessonId);
}

/** 出欠を1件更新し、カードを追従させる */
export async function setAttendanceStatus(
  lessonId: number,
  studentId: number,
  status: string,
) {
  await prisma.attendance.upsert({
    where: { lessonId_studentId: { lessonId, studentId } },
    create: { lessonId, studentId, status },
    update: { status },
  });
  await syncCardsForLesson(lessonId);
}
