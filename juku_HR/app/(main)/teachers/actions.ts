"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireAdmin } from "@/lib/dal";

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
