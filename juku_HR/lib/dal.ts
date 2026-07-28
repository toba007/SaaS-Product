import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { readSessionTeacherId } from "./auth";
import { ROLE } from "./constants";

/**
 * ログイン中の講師を返す。ログインしていなければ null。
 *
 * ここが認可の本体。proxy.ts でも Cookie は見ているが、あれは「Cookie が無ければ
 * ログイン画面へ送る」だけの楽観的なチェックで、防御としては当てにしない。
 * 実際に誰であるかは必ずここで DB に問い合わせて決める。
 *
 * cache() で包んでいるので、1リクエスト中に何度呼んでも DB を叩くのは1回。
 */
export const currentTeacher = cache(async () => {
  const id = await readSessionTeacherId();
  if (id === null) return null;

  const teacher = await prisma.teacher.findUnique({ where: { id } });
  // Cookie が有効でも、退職していればもう通さない
  if (!teacher || !teacher.active) return null;

  return teacher;
});

/** ログインしていなければログイン画面へ送る */
export async function requireAuth(returnTo?: string) {
  const teacher = await currentTeacher();
  if (!teacher) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return teacher;
}

/** 管理者でなければ講師画面へ送る */
export async function requireAdmin(returnTo?: string) {
  const teacher = await requireAuth(returnTo);
  if (teacher.role !== ROLE.ADMIN) redirect("/t");
  return teacher;
}
