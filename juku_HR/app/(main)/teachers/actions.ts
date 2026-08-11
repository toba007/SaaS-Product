"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireAdmin, currentTeacher } from "@/lib/dal";
import { ROLE } from "@/lib/constants";
import {
  checkDelete,
  checkRetire,
  loginIdTakenError,
  validateNewTeacher,
} from "@/lib/teachers";

/** 紛らわしい文字（0/O, 1/l/I）を抜いた文字種。口頭で伝えても間違えないように。 */
const CHARS = "abcdefghijkmnpqrstuvwxyz23456789";

function randomPassword(len = 10): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CHARS[randomInt(CHARS.length)];
  return out;
}

export type ResetState = {
  teacherId?: number;
  name?: string;
  password?: string;
  error?: string;
};

/**
 * パスワードを作り直す。忘れたとき用。
 * ハッシュしか保存していないので、今のパスワードを表示することはできない。
 * 新しいものを発行して、その場で1回だけ見せる。
 */
export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  await requireAdmin();

  const id = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher) return { error: "講師が見つかりません" };

  const password = randomPassword();
  await prisma.teacher.update({
    where: { id },
    data: { passwordHash: hashPassword(password) },
  });

  revalidatePath("/teachers");
  // 平文は保存していない。ここで返した1回きり。
  return { teacherId: id, name: teacher.name, password };
}


// ---------- 追加 ----------

export type AddState = {
  /** 追加できたときだけ入る。パスワードはここでの1回きり。 */
  added?: { id: number; name: string; loginId: string; password: string };
  error?: string;
};

/**
 * 講師を追加する。
 *
 * パスワードは自動で作り、**その場で1回だけ表示する**。
 * ハッシュしか保存しないので、後から見ることはできない（再発行はできる）。
 *
 * 担当科目・勤務上限・給与の単価はここでは入れない。
 * 入力欄が増えて登録が止まるより、先に登録して各画面で埋めるほうが早い。
 */
export async function addTeacher(
  _prev: AddState,
  formData: FormData,
): Promise<AddState> {
  await requireAdmin();

  const checked = validateNewTeacher({
    name: String(formData.get("name") ?? ""),
    kana: String(formData.get("kana") ?? ""),
    loginId: String(formData.get("loginId") ?? ""),
    role: String(formData.get("role") ?? ""),
    employment: String(formData.get("employment") ?? ""),
  });
  if (!checked.ok) return { error: checked.error };
  const input = checked.value;

  // 退職した講師のIDも含めて重複を見る。使い回すと過去の記録と取り違える。
  const dup = await prisma.teacher.findUnique({
    where: { loginId: input.loginId },
    select: { id: true, active: true },
  });
  if (dup) return { error: loginIdTakenError(input.loginId, dup.active) };

  const password = randomPassword();
  const created = await prisma.teacher.create({
    data: { ...input, passwordHash: hashPassword(password) },
    select: { id: true, name: true, loginId: true },
  });

  revalidatePath("/teachers");
  revalidatePath("/teachers/subjects");
  revalidatePath("/shifts/rules");
  revalidatePath("/payroll/settings");

  return { added: { ...created, password } };
}

// ---------- 退職・復帰・削除 ----------

export type RemoveState = { message?: string; error?: string };

/**
 * 退職にする（在籍から外す）。
 *
 * **記録は消さない。** 過去のシフト・勤怠・給与がぶら下がっているので、
 * 行を消すと締めた月の給与が計算し直せなくなる。
 * 退職者は一覧から外れ、シフトの割当対象にもならない。
 */
export async function retireTeacher(
  _prev: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  await requireAdmin();

  const id = Number(formData.get("teacherId"));
  const [teacher, me, activeAdminCount] = await Promise.all([
    prisma.teacher.findUnique({ where: { id } }),
    currentTeacher(),
    prisma.teacher.count({ where: { role: ROLE.ADMIN, active: true } }),
  ]);
  if (!teacher) return { error: "講師が見つかりません" };

  const allowed = checkRetire(teacher, { actorId: me?.id ?? null, activeAdminCount });
  if (!allowed.ok) return { error: allowed.error };

  await prisma.teacher.update({ where: { id }, data: { active: false } });

  revalidatePath("/teachers");
  revalidatePath("/shifts/board");
  return { message: `${teacher.name} さんを退職にしました` };
}

/** 退職を取り消して在籍に戻す。押し間違い用。 */
export async function restoreTeacher(
  _prev: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  await requireAdmin();

  const id = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher) return { error: "講師が見つかりません" };

  await prisma.teacher.update({ where: { id }, data: { active: true } });

  revalidatePath("/teachers");
  return { message: `${teacher.name} さんを在籍に戻しました` };
}

/**
 * 完全に消す。**誤って登録した講師を取り消すためのもの。**
 *
 * 記録が1件でもあれば消させない。消すと、その講師が入っていたシフトや
 * 締めた月の給与が辻褄の合わない状態になる。その場合は退職にする。
 */
export async function deleteTeacher(
  _prev: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  await requireAdmin();

  const id = Number(formData.get("teacherId"));
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          lessons: true,
          cards: true,
          requests: true,
          assignments: true,
          punches: true,
          duties: true,
          adminWorks: true,
          messages: true,
          shiftComments: true,
          sentComments: true,
        },
      },
    },
  });
  if (!teacher) return { error: "講師が見つかりません" };

  const me = await currentTeacher();
  const records = Object.values(teacher._count).reduce((a, b) => a + b, 0);

  const allowed = checkDelete(teacher, { actorId: me?.id ?? null, records });
  if (!allowed.ok) return { error: allowed.error };

  // 担当科目・勤務上限・単価は設定なので、講師と一緒に消える（onDelete: Cascade）
  await prisma.teacher.delete({ where: { id } });

  revalidatePath("/teachers");
  return { message: `${teacher.name} さんを削除しました` };
}
