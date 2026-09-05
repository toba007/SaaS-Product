"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { saveSetting } from "@/lib/settings";
import { SUBJECT_STREAM } from "@/lib/constants";

/**
 * 塾の設定を保存する。
 *
 * ここの数字は必要人数の計算にそのまま効く。
 * 個別の上限を実際より大きくすると、必要な講師数が少なく出て当日足りなくなるので、
 * 分からないうちは小さいままにしておくほうが安全。
 */
export async function updateSchoolSetting(formData: FormData) {
  await requireAdmin();

  await saveSetting({
    indivMaxStudents: Number(formData.get("indivMaxStudents")),
    maxGroupRooms: Number(formData.get("maxGroupRooms")),
    maxIndivRooms: Number(formData.get("maxIndivRooms")),
  });

  revalidatePath("/settings");
  // 選べる授業形態が変わるので、形態を出している画面も作り直させる
  revalidatePath("/students/subjects");
  revalidatePath("/payroll/settings");
  revalidatePath("/attendance");
}

/**
 * 科目の系統（文系／理系）を決める。
 *
 * ---- 何のためか ----
 * **個別の組（1人の講師が同時に見る生徒の集合）を寄せる向き**が決まる。
 * 講師が担当するのは得意な2科目ほどで、その2つは文系どうし・理系どうしに
 * なりやすい。英と国の組は持てる人がいるが、英と数の組はまずいない。
 *
 * 実在の講師の担当範囲（TeacherSubject）を見るのがいちばん正しいが、
 * それだけだと**講師の登録が埋まるまで組が作れない。** ここは塾側にとって
 * 自明な情報なので、入力がほぼ要らないわりに初期状態を救える。
 */
export async function setSubjectStream(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("subjectId"));
  const stream = String(formData.get("stream") ?? "");
  if (!Number.isInteger(id)) return;
  // 知らない値を入れると、寄せ方が黙って変わる
  if (!Object.values(SUBJECT_STREAM).some((v) => v === stream)) return;

  const subject = await prisma.subject.findUnique({ where: { id }, select: { id: true } });
  if (!subject) return;

  await prisma.subject.update({ where: { id }, data: { stream } });

  revalidatePath("/settings");
  // 組の寄せ方が変わるので、時間割と必要人数の画面も作り直す
  revalidatePath("/shifts/timetable");
  revalidatePath("/shifts/plans");
}
