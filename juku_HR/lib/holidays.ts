import { dayOfWeek, shiftDays } from "./dates";
import { todayISO } from "./constants";

/**
 * 日本の祝日を計算する。
 *
 * 祝日は休校を決める材料そのものなのに、カレンダーに出ていなかった。
 * 「この日は祝日だから休校にしよう」を画面を見ながら判断できるようにする。
 *
 * 外部のカレンダー（Google の祝日ICSなど）を読みに行く作りにはしていない。
 * 塾HR は閉じた環境で動かす前提で、予定の表示のために外へ通信を出したくないため。
 * そのぶん、法改正には手で追随する必要がある（第3節の注意書き）。
 *
 * Prisma にもネットワークにも依存しない純粋関数。テストしやすさを優先している。
 *
 * ## 対応している範囲
 * 1970年〜2099年。春分・秋分の近似式がこの範囲でのみ正しい。
 *
 * ## 追随が必要になる場合
 * 祝日法が変わったとき（即位の日のような一度きりの祝日、五輪のときの移動など）。
 * ここを直せば、カレンダーの表示もシフトの判断材料も同時に直る。
 */

export type Holiday = { date: string; name: string };

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;

/** その月の第n ◯曜日（ハッピーマンデー用）。weekday は 0=日 */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  const firstDow = new Date(year, month - 1, 1).getDay();
  return 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7;
}

/**
 * 春分の日・秋分の日。
 * 天文計算の近似式で、1980〜2099年の範囲で実際の官報と一致する。
 */
function equinox(year: number, spring: boolean): number {
  const base = spring ? 20.8431 : 23.2488;
  return Math.floor(
    base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4),
  );
}

/** その年の祝日（振替休日・国民の休日を含む）を日付順で返す */
export function holidaysOf(year: number): Holiday[] {
  const fixed: Holiday[] = [
    { date: iso(year, 1, 1), name: "元日" },
    { date: iso(year, 2, 11), name: "建国記念の日" },
    { date: iso(year, 2, 23), name: "天皇誕生日" },
    { date: iso(year, 4, 29), name: "昭和の日" },
    { date: iso(year, 5, 3), name: "憲法記念日" },
    { date: iso(year, 5, 4), name: "みどりの日" },
    { date: iso(year, 5, 5), name: "こどもの日" },
    { date: iso(year, 8, 11), name: "山の日" },
    { date: iso(year, 11, 3), name: "文化の日" },
    { date: iso(year, 11, 23), name: "勤労感謝の日" },
    // ハッピーマンデー
    { date: iso(year, 1, nthWeekday(year, 1, 1, 2)), name: "成人の日" },
    { date: iso(year, 7, nthWeekday(year, 7, 1, 3)), name: "海の日" },
    { date: iso(year, 9, nthWeekday(year, 9, 1, 3)), name: "敬老の日" },
    { date: iso(year, 10, nthWeekday(year, 10, 1, 2)), name: "スポーツの日" },
    // 年によって日が動く
    { date: iso(year, 3, equinox(year, true)), name: "春分の日" },
    { date: iso(year, 9, equinox(year, false)), name: "秋分の日" },
  ];

  const byDate = new Map(fixed.map((h) => [h.date, h]));

  // 振替休日: 祝日が日曜なら、次の平日を休みにする
  for (const h of [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (dayOfWeek(h.date) !== 0) continue;
    let d = shiftDays(h.date, 1);
    while (byDate.has(d)) d = shiftDays(d, 1);
    byDate.set(d, { date: d, name: "振替休日" });
  }

  // 国民の休日: 祝日に挟まれた平日は休みになる（敬老の日と秋分の日の間で起きる）
  for (const h of [...byDate.values()]) {
    const between = shiftDays(h.date, 1);
    const after = shiftDays(h.date, 2);
    if (byDate.has(after) && !byDate.has(between) && dayOfWeek(between) !== 0) {
      byDate.set(between, { date: between, name: "国民の休日" });
    }
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 期間に含まれる祝日。年をまたいでも拾えるようにしてある。 */
export function holidaysBetween(from: string, to: string): Holiday[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: Holiday[] = [];
  for (let y = y1; y <= y2; y++) {
    out.push(...holidaysOf(y).filter((h) => h.date >= from && h.date <= to));
  }
  return out;
}

/** その日が祝日なら名前を返す。祝日でなければ null */
export function holidayName(date: string): string | null {
  return holidaysOf(Number(date.slice(0, 4))).find((h) => h.date === date)?.name ?? null;
}

/** 今日が祝日か（画面の見出しなどで使う想定） */
export function isHolidayToday(): boolean {
  return holidayName(todayISO()) !== null;
}
