import { prisma } from "./prisma";
import { ROLE } from "./constants";

/**
 * 「講師 × 日付」のやりとり。
 *
 * 講師側はシフト提出のカレンダーと確定シフトのカレンダーの2画面から、
 * 管理者側はシフト表から、同じスレッドを開く。どこから開いても同じ会話。
 */

export type CommentLite = {
  id: number;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

/**
 * どの講師のスレッドに書くのかを決める。
 *
 * 講師は自分のスレッドにしか書けない。フォームに teacherId が入っていても見ない。
 * Server Action は画面を通さず直接叩けるので、ここを画面側の作りに頼らない。
 * 宛先を選べるのは管理者だけ。
 */
export function resolveThreadTarget(
  me: { id: number; role: string },
  requestedTeacherId: number,
): number | null {
  if (me.role !== ROLE.ADMIN) return me.id;
  return Number.isInteger(requestedTeacherId) && requestedTeacherId > 0
    ? requestedTeacherId
    : null;
}

/** その日のやりとりを古い順に取る（画面は上から下へ流れる） */
export async function thread(
  teacherId: number,
  date: string,
): Promise<CommentLite[]> {
  const rows = await prisma.shiftComment.findMany({
    where: { teacherId, date },
    orderBy: { id: "asc" },
    include: { sender: { select: { name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    senderRole: r.senderRole,
    senderName: r.sender.name,
    body: r.body,
    createdAt: r.createdAt,
    readAt: r.readAt,
  }));
}

/**
 * 自分宛ての未読が何件あるかを日付ごとに返す。カレンダーの日付に付ける印に使う。
 *
 * 「自分宛て」は「自分と違う役割の人が書いたもの」。管理者が2人いても、
 * 片方が書いたものはもう片方にとって既読扱いでよい（教室として1つの窓口なので）。
 */
export async function unreadByDate(
  teacherId: number,
  from: string,
  to: string,
  viewerRole: string,
): Promise<Map<string, number>> {
  const rows = await prisma.shiftComment.findMany({
    where: {
      teacherId,
      date: { gte: from, lte: to },
      senderRole: { not: viewerRole },
      readAt: null,
    },
    select: { date: true },
  });

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + 1);
  return map;
}

/**
 * 管理者向け。全講師ぶんの未読を「講師id:日付」で引ける形で返す。
 * シフト表は講師×日付の升目なので、この形が一番使いやすい。
 */
export async function unreadForAdmin(
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const rows = await prisma.shiftComment.findMany({
    where: {
      date: { gte: from, lte: to },
      senderRole: ROLE.TEACHER,
      readAt: null,
    },
    select: { teacherId: true, date: true },
  });

  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.teacherId}:${r.date}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** 相手が書いたぶんを既読にする。スレッドを開いたときに呼ぶ。 */
export async function markThreadRead(
  teacherId: number,
  date: string,
  viewerRole: string,
): Promise<void> {
  await prisma.shiftComment.updateMany({
    where: { teacherId, date, senderRole: { not: viewerRole }, readAt: null },
    data: { readAt: new Date() },
  });
}

/** 未読の総数。講師側のタブに出すバッジ用。 */
export async function unreadTotalForTeacher(teacherId: number): Promise<number> {
  return prisma.shiftComment.count({
    where: { teacherId, senderRole: ROLE.ADMIN, readAt: null },
  });
}
