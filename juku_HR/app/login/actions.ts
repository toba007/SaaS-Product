"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { homeFor } from "@/lib/constants";

export type LoginState = { error?: string };

/**
 * ログイン。管理者も講師も同じ入力欄から入り、role で行き先が変わる。
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!loginId || !password) {
    return { error: "IDとパスワードを入力してください" };
  }

  const teacher = await prisma.teacher.findUnique({ where: { loginId } });

  // ID が無い場合とパスワードが違う場合で、返すメッセージも処理時間も変えない。
  // 分けると「このIDは存在する」と教えてしまう。
  const ok =
    teacher !== null &&
    teacher.active &&
    verifyPassword(password, teacher.passwordHash);

  if (!ok || !teacher) {
    return { error: "IDまたはパスワードが違います" };
  }

  await createSession(teacher.id);

  // next は自分のサイト内のパスだけ許す。
  // "//evil.com" のような値を通すと、ログイン後に外部へ飛ばされてしまう。
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : homeFor(teacher.role);

  redirect(safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
