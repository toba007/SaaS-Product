"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { lessonStyles } from "@/lib/constants";
import { getSetting } from "@/lib/settings";

/**
 * 押すたびに 未受講 → 集団 → 1対1 → … → 未受講 と回す。
 * どこまで回るかは塾の設定（個別の上限人数）で決まる。
 */
function cycleOf(indivMax: number): (string | null)[] {
  return [...lessonStyles(indivMax), null];
}

function nextFormat(current: string | null, cycle: (string | null)[]): string | null {
  if (current === null) return cycle[0];
  const i = cycle.indexOf(current);
  return i < 0 ? cycle[0] : cycle[(i + 1) % cycle.length];
}

/**
 * 生徒が取る科目を1つ切り替える。
 *
 * 入塾のときに「何を取るか」を聞いて登録する。
 * ここが埋まっていないと、集団のクラス分けで「誰を振り分けるのか」が分からない。
 */
export async function cycleStudentSubject(formData: FormData) {
  await requireAdmin();

  const studentId = Number(formData.get("studentId"));
  const subjectId = Number(formData.get("subjectId"));
  if (!Number.isInteger(studentId) || !Number.isInteger(subjectId)) return;

  const [student, subject] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
  ]);
  if (!student || !subject) return;

  // 同じ科目を複数の形態で取っていることもあるが、この画面では1つに絞って回す。
  // （集団と個別を併用する場合は、別々に登録する運用にする）
  const existing = await prisma.studentSubject.findFirst({
    where: { studentId, subjectId, active: true },
  });

  const cycle = cycleOf((await getSetting()).indivMaxStudents);
  const next = nextFormat(existing?.format ?? null, cycle);

  if (next === null) {
    if (existing) {
      // 行を消さず active=false にする。消すと過去の授業と辻褄が合わなくなる。
      await prisma.studentSubject.update({
        where: { id: existing.id },
        data: { active: false },
      });
    }
  } else if (existing) {
    // 同じ (生徒, 科目, 形態) が非アクティブで残っていることがあるので、それを起こす
    const revive = await prisma.studentSubject.findUnique({
      where: {
        studentId_subjectId_format: { studentId, subjectId, format: next },
      },
    });
    if (revive && revive.id !== existing.id) {
      await prisma.$transaction([
        prisma.studentSubject.update({
          where: { id: existing.id },
          data: { active: false },
        }),
        prisma.studentSubject.update({
          where: { id: revive.id },
          data: { active: true },
        }),
      ]);
    } else {
      await prisma.studentSubject.update({
        where: { id: existing.id },
        data: { format: next },
      });
    }
  } else {
    await prisma.studentSubject.upsert({
      where: {
        studentId_subjectId_format: { studentId, subjectId, format: next },
      },
      create: { studentId, subjectId, format: next },
      update: { active: true },
    });
  }

  revalidatePath("/students/subjects");
  revalidatePath("/classes");
}
