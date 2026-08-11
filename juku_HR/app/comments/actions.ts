"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { markThreadRead, resolveThreadTarget } from "@/lib/comments";
import { COMMENT_BODY_MAX, ROLE } from "@/lib/constants";

/**
 * 「講師 × 日付」のやりとりに1件書く。
 *
 * 講師側の2つのカレンダーと管理者のシフト表から同じものを呼ぶので、
 * どの画面にも属さないここに置いている。
 */

export type CommentState = { error?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath("/t");
  revalidatePath("/t/schedule");
  revalidatePath("/shifts");
}

export async function postComment(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const me = await requireAuth();

  const date = String(formData.get("date") ?? "");
  if (!DATE.test(date)) return { error: "日付が正しくありません" };

  // 誰との会話か。講師が他人のスレッドに書けないことは resolveThreadTarget が担保する。
  const teacherId = resolveThreadTarget(me, Number(formData.get("teacherId")));
  if (teacherId === null) return { error: "宛先が正しくありません" };

  // 管理者が指定した講師が実在するか。退職済みには書けない。
  if (me.role === ROLE.ADMIN) {
    const target = await prisma.teacher.findFirst({
      where: { id: teacherId, active: true },
      select: { id: true },
    });
    if (!target) return { error: "その講師は見つかりません" };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "" }; // 空送信は黙って無視する（誤タップ）
  if (body.length > COMMENT_BODY_MAX) {
    return { error: `${COMMENT_BODY_MAX}文字までにしてください` };
  }

  await prisma.shiftComment.create({
    data: { teacherId, date, senderRole: me.role, senderId: me.id, body },
  });

  refresh();
  return {};
}

/** スレッドを開いたときに、相手が書いたぶんを既読にする */
export async function markRead(teacherId: number, date: string) {
  const me = await requireAuth();
  const target = resolveThreadTarget(me, teacherId);
  if (target === null) return;
  await markThreadRead(target, date, me.role);
}
