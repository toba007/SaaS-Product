import { todayISO } from "./constants";

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export type Ym = { year: number; month: number }; // month は 1-12

export function parseYm(s: string | undefined): Ym {
  const m = s?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function formatYm({ year, month }: Ym): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths({ year, month }: Ym, delta: number): Ym {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** その月の日を "YYYY-MM-DD" の配列で返す */
export function monthDays({ year, month }: Ym): string[] {
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) =>
    todayISO(new Date(year, month - 1, i + 1)),
  );
}

/**
 * 月カレンダーを日曜始まりの週の配列にして返す。
 * 前月・翌月にはみ出るマスは null。
 */
export function monthGrid(ym: Ym): (string | null)[][] {
  const days = monthDays(ym);
  const firstDow = new Date(ym.year, ym.month - 1, 1).getDay();
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
}

/** "2026-07-15" -> 15 */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** 0=日 .. 6=土 */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function isWeekend(iso: string): boolean {
  const w = dayOfWeek(iso);
  return w === 0 || w === 6;
}

/** その日を含む週の日曜日を返す */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return todayISO(dt);
}

/** その日を含む週の7日ぶんを日曜始まりで返す */
export function weekDays(iso: string): string[] {
  const start = weekStart(iso);
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => todayISO(new Date(y, m - 1, d + i)));
}

/** iso から days 日ずらした日付 */
export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/**
 * from から to までの日を "YYYY-MM-DD" の配列で返す（両端を含む）。
 * 逆順に渡されたら空を返す。カレンダーではなく期間で扱う画面で使う。
 */
export function datesBetween(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  // 月をまたぐので Date に落として1日ずつ進める。上限は安全弁。
  for (let i = 0; i < 400 && cur <= to; i++) {
    out.push(cur);
    cur = shiftDays(cur, 1);
  }
  return out;
}

/** date が期間内か（両端を含む）。文字列のまま比較できるのが "YYYY-MM-DD" の利点。 */
export function withinTerm(
  date: string,
  term: { startDate: string; endDate: string },
): boolean {
  return date >= term.startDate && date <= term.endDate;
}
