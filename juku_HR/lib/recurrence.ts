import { dayOfWeek, shiftDays } from "./dates";

/**
 * 繰り返しの予定を、実際の日付に展開する。
 *
 * 規則を1件だけ保存する持ち方（RRULE）にはしていない。
 * 「毎週日曜は休校。ただし今週だけは開ける」が入った瞬間に例外の管理が必要になり、
 * `isClosedDate()` の判定も規則の展開を毎回することになる。
 * 塾で扱う期間（長くても1年ぶん）なら、日付の行に展開したほうが単純で速い。
 *
 * Prisma に依存しない純粋関数にしてある。DB を用意せずに数えられるようにするため。
 */

export const REPEAT = {
  /** 繰り返さない */
  NONE: "NONE",
  /** 毎週。曜日は開始日から決まる */
  WEEKLY: "WEEKLY",
  /** 隔週 */
  BIWEEKLY: "BIWEEKLY",
  /** 毎月同じ日。31日など無い月は飛ばす */
  MONTHLY: "MONTHLY",
} as const;
export type Repeat = (typeof REPEAT)[keyof typeof REPEAT];

export const REPEAT_ORDER: string[] = [
  REPEAT.NONE,
  REPEAT.WEEKLY,
  REPEAT.BIWEEKLY,
  REPEAT.MONTHLY,
];

export const REPEAT_LABEL: Record<string, string> = {
  NONE: "繰り返さない",
  WEEKLY: "毎週",
  BIWEEKLY: "隔週",
  MONTHLY: "毎月",
};

/**
 * 作りすぎの歯止め。
 * 終了日を打ち間違えて10年ぶん作られると、消すのも一苦労になる。
 */
export const MAX_OCCURRENCES = 200;

export type Occurrence = { startDate: string; endDate: string };

/**
 * 繰り返しの回数ぶんの日付を返す。
 *
 * @param startDate 1回目の開始日 "YYYY-MM-DD"
 * @param endDate   1回目の終了日（1日だけなら startDate と同じ）
 * @param repeat    REPEAT のいずれか
 * @param until     繰り返しの打ち切り日。この日を過ぎたら作らない
 */
export function expandRepeat(
  startDate: string,
  endDate: string,
  repeat: string,
  until: string,
): Occurrence[] {
  const first = { startDate, endDate };
  if (repeat === REPEAT.NONE || !until || until < startDate) return [first];

  // 1回ぶんの長さ（日数）。2回目以降も同じ長さで作る。
  const span = daysBetween(startDate, endDate);

  const out: Occurrence[] = [];
  let s = startDate;
  while (s <= until && out.length < MAX_OCCURRENCES) {
    out.push({ startDate: s, endDate: shiftDays(s, span) });
    s = next(s, repeat, startDate);
    // 進まない指定（未知の値など）で無限に回らないようにする
    if (!s) break;
  }
  return out.length > 0 ? out : [first];
}

/** 次の開始日。毎月だけは「同じ日」を保つので、1回目の日付を基準にする。 */
function next(current: string, repeat: string, firstStart: string): string {
  if (repeat === REPEAT.WEEKLY) return shiftDays(current, 7);
  if (repeat === REPEAT.BIWEEKLY) return shiftDays(current, 14);
  if (repeat === REPEAT.MONTHLY) return nextMonthSameDay(current, firstStart);
  return "";
}

/**
 * 翌月の同じ日。
 *
 * 1月31日の翌月は2月31日にならない。存在しない日は飛ばして、
 * その次に「同じ日がある月」を探す（3月31日になる）。
 * shiftDays で30日足す作りにすると、月をまたぐたびに日がずれていく。
 */
function nextMonthSameDay(current: string, firstStart: string): string {
  const targetDay = Number(firstStart.slice(8, 10));
  let [y, m] = [Number(current.slice(0, 4)), Number(current.slice(5, 7))];

  // 12か月先まで見て見つからなければ諦める（起きないが、無限ループは避ける）
  for (let i = 0; i < 12; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (targetDay <= daysInMonth(y, m)) {
      return `${y}-${String(m).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
    }
  }
  return "";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 2つの日付の差（日数）。同じ日なら 0 */
function daysBetween(from: string, to: string): number {
  const d = (iso: string) => {
    const [y, m, day] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((d(to) - d(from)) / 86400000);
}

/** 「毎週◯曜」のように、選んだ繰り返しを日本語で説明する */
export function describeRepeat(
  repeat: string,
  startDate: string,
  until: string,
): string {
  if (repeat === REPEAT.NONE) return REPEAT_LABEL.NONE;
  const w = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek(startDate)];
  const head =
    repeat === REPEAT.MONTHLY
      ? `毎月${Number(startDate.slice(8, 10))}日`
      : `${REPEAT_LABEL[repeat]}${w}曜`;
  return until ? `${head}（${until} まで）` : head;
}
