"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { nextLevel } from "@/lib/subjects";
import { SUBJECT_LEVEL } from "@/lib/constants";

/**
 * 講師×科目の習熟度を1段階進める（未設定 → 可 → 得意 → 専門 → 未設定）。
 *
 * 講師が自分の担当科目を書き換えられると、入りたいコマに入れるようになってしまう。
 * 登録は管理者だけ。
 */
export async function cycleTeacherSubject(formData: FormData) {
  await requireAdmin();

  const teacherId = Number(formData.get("teacherId"));
  const subjectId = Number(formData.get("subjectId"));
  if (!Number.isInteger(teacherId) || !Number.isInteger(subjectId)) return;

  // フォームの値は書き換えられるので、実在するかを毎回確かめる
  const [teacher, subject] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
  ]);
  if (!teacher || !subject) return;

  const key = { teacherId_subjectId: { teacherId, subjectId } };
  const current = await prisma.teacherSubject.findUnique({ where: key });
  const level = nextLevel(current?.level);

  if (level === SUBJECT_LEVEL.NONE) {
    // 「担当しない」は行を消して表す。level=0 の行を残すと、
    // 集計のたびに 0 を除く条件を書くことになり、書き漏らしが出る。
    if (current) await prisma.teacherSubject.delete({ where: key });
  } else {
    await prisma.teacherSubject.upsert({
      where: key,
      create: { teacherId, subjectId, level },
      update: { level },
    });
  }

  revalidatePath("/teachers/subjects");
  // 自動作成の候補が変わるので、盤面の表示にも効く
  revalidatePath("/shifts/board");
}
