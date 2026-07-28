import { prisma } from "./prisma";
import { SHIFT } from "./constants";
import { termForDate } from "./terms";
import { excludeClosed, isClosedDate } from "./events";

/**
 * 講師のシフト希望を1コマ分入れる。
 * 同じ状態をもう一度押したら取り消し（＝未回答に戻す）。
 */
export async function setShiftRequest(
  teacherId: number,
  date: string,
  periodId: number,
  status: string,
) {
  // 休校日には出せない。画面でも灰色にしているが、それは見た目でしかないので here でも弾く。
  if (await isClosedDate(date)) return;

  const key = { teacherId_date_periodId: { teacherId, date, periodId } };
  const existing = await prisma.shiftRequest.findUnique({ where: key });

  if (existing?.status === status) {
    await prisma.shiftRequest.delete({ where: key });
    // 出られないことにした枠の確定を消す、という副作用はここでは起こさない。
    // 確定済みのシフトを消していいかは人が判断すべきなので、board 側で警告する。
    return;
  }

  const term = await termForDate(date);
  await prisma.shiftRequest.upsert({
    where: key,
    create: { teacherId, date, periodId, status, termId: term?.id ?? null },
    update: { status },
  });
}

/** 確定シフトを付けたり外したりする */
export async function toggleAssignment(
  teacherId: number,
  date: string,
  periodId: number,
) {
  const key = { teacherId_date_periodId: { teacherId, date, periodId } };
  const existing = await prisma.shiftAssignment.findUnique({ where: key });

  if (existing) {
    await prisma.shiftAssignment.delete({ where: key });
    return;
  }

  // 休校日に人を割り当てない。外すのは常に許す（休校になった後の後始末ができるように）。
  if (await isClosedDate(date)) return;

  const term = await termForDate(date);
  await prisma.shiftAssignment.create({
    data: { teacherId, date, periodId, termId: term?.id ?? null },
  });
}

/**
 * 「毎週火曜の2限は出られる」をまとめて入れる。
 * 講師の予定はたいてい曜日で決まっているので、月カレンダーを1日ずつ押させない。
 * 既に別の回答が入っている日も上書きする（まとめて指定した意図を優先する）。
 */
export async function bulkSetWeekday(
  teacherId: number,
  dates: string[],
  periodIds: number[],
  status: string,
) {
  // まとめて入れるときも休校日は飛ばす
  const open = await excludeClosed(dates);
  for (const date of open) {
    const term = await termForDate(date);
    for (const periodId of periodIds) {
      await prisma.shiftRequest.upsert({
        where: { teacherId_date_periodId: { teacherId, date, periodId } },
        create: { teacherId, date, periodId, status, termId: term?.id ?? null },
        update: { status },
      });
    }
  }
}

/** 指定した月の希望をまるごと消す（出し直したいとき用） */
export async function clearMonth(teacherId: number, dates: string[]) {
  await prisma.shiftRequest.deleteMany({
    where: { teacherId, date: { in: dates } },
  });
}

export type LoadRow = {
  teacherId: number;
  name: string;
  employment: string;
  /** 出られると答えたコマ数（OK + PREFER） */
  available: number;
  /** 実際に入れたコマ数 */
  assigned: number;
  /** 希望のうち何割入れたか。希望0なら null */
  fillRate: number | null;
  /** 「出られない」と答えているのに確定が入っているコマ数。0であるべき */
  conflicts: number;
};

/**
 * 期間内の講師ごとの負担を集計する。
 *
 * 「特定の講師に負担が偏る」「集める人の贔屓が入る」という課題に対して、
 * 割当を数字で見えるようにするのがこの関数の目的。assigned だけを見ると
 * 「そもそも希望を多く出している講師」が多く入って当然なので、
 * 希望に対する充足率（fillRate）も併せて出している。
 */
export async function loadSummary(
  fromDate: string,
  toDate: string,
): Promise<LoadRow[]> {
  const [teachers, requests, assignments] = await Promise.all([
    prisma.teacher.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    }),
    prisma.shiftRequest.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
    }),
  ]);

  const ngKeys = new Set(
    requests
      .filter((r) => r.status === SHIFT.NG)
      .map((r) => `${r.teacherId}:${r.date}:${r.periodId}`),
  );

  return teachers.map((t) => {
    const available = requests.filter(
      (r) => r.teacherId === t.id && r.status !== SHIFT.NG,
    ).length;
    const mine = assignments.filter((a) => a.teacherId === t.id);
    const conflicts = mine.filter((a) =>
      ngKeys.has(`${a.teacherId}:${a.date}:${a.periodId}`),
    ).length;

    return {
      teacherId: t.id,
      name: t.name,
      employment: t.employment,
      available,
      assigned: mine.length,
      fillRate: available === 0 ? null : mine.length / available,
      conflicts,
    };
  });
}

/** 偏りの目安。割当コマ数の最大と最小の差を返す（希望を出している講師のみ） */
export function spread(rows: LoadRow[]): number {
  const active = rows.filter((r) => r.available > 0);
  if (active.length === 0) return 0;
  const counts = active.map((r) => r.assigned);
  return Math.max(...counts) - Math.min(...counts);
}
