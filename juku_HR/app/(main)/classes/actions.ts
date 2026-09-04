"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { CLASS_LEVEL_MAX, classLevelLabel } from "@/lib/constants";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type ClassState = { error?: string };

/**
 * 集団クラスを作る。
 *
 * レベルは Ⅰ〜Ⅲ だが、必ず3つ作るわけではない。
 * 人数によって2クラスのことも、1クラスだけのこともあるので、要る数だけ作る。
 */
export async function createClassGroup(
  _prev: ClassState,
  formData: FormData,
): Promise<ClassState> {
  await requireAdmin();

  const grade = String(formData.get("grade") ?? "").trim();
  const subjectId = Number(formData.get("subjectId"));
  const level = Number(formData.get("level"));
  // 「月曜は英英数」のように同じ日に何コマも入るので、コマは複数選べる
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const periodIds = formData.getAll("periodIds").map(Number).filter(Number.isInteger);
  const capacity = Number(formData.get("capacity") ?? 0);
  const slotsPerWeek = Number(formData.get("slotsPerWeek") ?? 1);
  const fromDate = String(formData.get("fromDate") ?? "");
  const toDate = String(formData.get("toDate") ?? "");

  if (!grade) return { error: "学年を選んでください" };
  if (!Number.isInteger(level) || level < 1 || level > CLASS_LEVEL_MAX) {
    return { error: "レベルが正しくありません" };
  }
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "曜日が正しくありません" };
  }
  // 0 は「その期は開講しない」。クラスだけ作っておく使い方を許す。
  if (!Number.isInteger(slotsPerWeek) || slotsPerWeek < 0 || slotsPerWeek > 20) {
    return { error: "週のコマ数は0〜20で入れてください" };
  }
  if (!ISO.test(fromDate) || !ISO.test(toDate)) {
    return { error: "有効期間を入力してください" };
  }
  if (fromDate > toDate) return { error: "終了日が開始日より前になっています" };

  const [subject, periods] = await Promise.all([
    prisma.subject.findUnique({ where: { id: subjectId } }),
    periodIds.length > 0
      ? prisma.period.findMany({ where: { id: { in: periodIds } }, select: { id: true } })
      : Promise.resolve([] as { id: number }[]),
  ]);
  if (!subject) return { error: "科目が見つかりません" };

  await prisma.classGroup.create({
    data: {
      name: `${grade}${subject.name}${classLevelLabel(level)}`,
      grade,
      subjectId,
      level,
      capacity: Number.isInteger(capacity) && capacity >= 0 ? capacity : 0,
      slotsPerWeek,
      fromDate,
      toDate,
      // 曜日とコマを選ばなかった場合は時間割を作らない。
      // 「週に何コマやるか」だけ決めておいて、いつやるかは
      // 開講時間割の画面で組む、という流れを取れるようにするため。
      sessions: {
        create: periods.map((p) => ({ dayOfWeek, periodId: p.id })),
      },
    },
  });

  revalidatePath("/classes");
  return {};
}

/**
 * 生徒をクラスに入れる／外す。
 *
 * 振り分けは人が決める。ドラッグして落とした先がそのまま配属になる。
 * toClassId が 0 のときは「未配属に戻す」。
 */
export async function moveStudent(formData: FormData) {
  await requireAdmin();

  const studentId = Number(formData.get("studentId"));
  const toClassId = Number(formData.get("toClassId"));
  const subjectId = Number(formData.get("subjectId"));
  if (!Number.isInteger(studentId) || !Number.isInteger(subjectId)) return;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) return;

  // 同じ科目のクラスからは必ず外す。外し忘れると、その生徒が
  // 同じ時間に2つの授業に出ることになる。
  const sameSubject = await prisma.classGroup.findMany({
    where: { subjectId },
    select: { id: true },
  });
  await prisma.classEnrollment.deleteMany({
    where: { studentId, classGroupId: { in: sameSubject.map((c) => c.id) } },
  });

  if (toClassId > 0) {
    const target = await prisma.classGroup.findUnique({ where: { id: toClassId } });
    // 別の科目のクラスへは入れない（画面の操作ミス）
    if (target && target.subjectId === subjectId) {
      await prisma.classEnrollment.create({
        data: { classGroupId: toClassId, studentId },
      });
    }
  }

  revalidatePath("/classes");
}

/** クラスを終了させる。組み直しのときは、消さずに有効期間を切る。 */
export async function closeClassGroup(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("classId"));
  const toDate = String(formData.get("toDate") ?? "");
  if (!Number.isInteger(id) || !ISO.test(toDate)) return;

  // 消すと過去の授業と辻褄が合わなくなるので、終了日を切るだけにする
  await prisma.classGroup.update({ where: { id }, data: { toDate } });
  revalidatePath("/classes");
}

/**
 * 週の開講コマ数を直す。
 *
 * ここが「塾が先に決める量」。**時間割を組む前に決まっている必要がある。**
 * **0 にすると、そのクラスは時間割に出てこない**（その期は開講しない）。
 * クラスの行は残るので、在籍と過去の授業の記録は保たれる。
 */
export async function setClassSlots(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("classGroupId"));
  const slots = Number(formData.get("slotsPerWeek"));
  if (!Number.isInteger(slots) || slots < 0 || slots > 20) return;

  const cls = await prisma.classGroup.findUnique({ where: { id }, select: { id: true } });
  if (!cls) return;

  await prisma.classGroup.update({ where: { id }, data: { slotsPerWeek: slots } });

  revalidatePath("/classes");
  revalidatePath("/shifts/timetable");
}
