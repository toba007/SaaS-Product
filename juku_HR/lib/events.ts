import { prisma } from "./prisma";
import { EVENT_KIND } from "./constants";
import { withinTerm } from "./dates";

export type EventLite = {
  id: number;
  startDate: string;
  endDate: string;
  title: string;
  kind: string;
  note: string;
  /** "HH:MM"。両方 null なら終日 */
  startTime: string | null;
  endTime: string | null;
};

/** 終日の予定か */
export function isAllDay(e: { startTime: string | null }): boolean {
  return e.startTime === null;
}

/** 期間が重なる塾の予定を取る */
export async function eventsBetween(from: string, to: string): Promise<EventLite[]> {
  return prisma.schoolEvent.findMany({
    // 期間が少しでも重なるもの。「終わりが from 以降」かつ「始まりが to 以前」
    where: { endDate: { gte: from }, startDate: { lte: to } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
}

/** その日にかかっている予定 */
export function eventsOn(date: string, events: EventLite[]): EventLite[] {
  return events.filter((e) => withinTerm(date, e));
}

/** その日は休校（閉室）か */
export function isClosed(date: string, events: EventLite[]): boolean {
  return eventsOn(date, events).some((e) => e.kind === EVENT_KIND.CLOSED);
}

/**
 * その日が休校かを DB に聞く。
 *
 * 画面側でも休校日は灰色にして押せなくしているが、それは見た目の話でしかない。
 * フォームの値を書き換えれば送れてしまうので、書き込む側でも必ずここで弾く。
 */
export async function isClosedDate(date: string): Promise<boolean> {
  const hit = await prisma.schoolEvent.findFirst({
    where: {
      kind: EVENT_KIND.CLOSED,
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { id: true },
  });
  return hit !== null;
}

/** 休校でない日だけに絞る */
export async function excludeClosed(dates: string[]): Promise<string[]> {
  if (dates.length === 0) return [];
  const closed = await prisma.schoolEvent.findMany({
    where: {
      kind: EVENT_KIND.CLOSED,
      endDate: { gte: dates[0] },
      startDate: { lte: dates[dates.length - 1] },
    },
  });
  return dates.filter((d) => !closed.some((e) => withinTerm(d, e)));
}
