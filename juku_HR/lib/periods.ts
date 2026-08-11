/**
 * コマ（時間割の枠）まわり。
 *
 * ---- コマの区切り方は塾ごとに違う ----
 * 「1限は17:00から80分」のような形はどこの塾にも当てはまらない。
 * 実際には、小学生は下校が早いので17:40から40分、中学生は部活の後なので
 * 19:15から50分、というように**学年帯ごとに別の時間割**を組む塾が多い。
 * さらに講習期間は学校が無いので朝から始まり、コマ数も長さも変わる。
 *
 * そのためコマは「期タイプ × 学年帯」で持ち、中身は塾に登録してもらう。
 *
 * ---- 学年帯をまたいでも講師は1人 ----
 * 小学生の時間帯と中学生の時間帯は普通は重ならないので、同じ講師が
 * 小2限に入ったあと中1限に入れる。1日の出勤枠は、その日の期タイプの
 * コマを**学年帯をまたいで時刻順に並べたもの**になる。
 *
 * ただし塾によっては時間帯が重なることがある（小と中を並行して開ける場合）。
 * 重なっていると「同じ講師が同時に2か所」が成立してしまうので、
 * 登録時に気づけるよう overlappingPairs() で拾えるようにしてある。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { GRADE_BAND, GRADE_BAND_SHORT, bandOfGrade } from "./constants";

/** 時刻の幅だけを見る判定に使う最小の形 */
export type TimeSpan = { startTime: string; endTime: string };

export type PeriodLite = {
  id: number;
  termKind: string;
  gradeBand: string;
  name: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  order: number;
};

/** "HH:MM" を 0時からの分に直す。比較と重なり判定に使う。 */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** コマの長さ（分）。日をまたぐコマは想定しない。 */
export function lengthOf(p: TimeSpan): number {
  return minutesOf(p.endTime) - minutesOf(p.startTime);
}

/**
 * 2つの時間帯が重なるか。
 * 「18:20 に終わって 18:25 に始まる」「18:20 に終わって 18:20 に始まる」は重ならない扱い。
 */
export function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  return (
    minutesOf(a.startTime) < minutesOf(b.endTime) &&
    minutesOf(b.startTime) < minutesOf(a.endTime)
  );
}

/** 開始時刻の早い順。同時刻なら order、それも同じなら id で決める（実行ごとに揺れないように） */
export function byTime<T extends TimeSpan & { order: number; id: number }>(
  a: T,
  b: T,
): number {
  return (
    minutesOf(a.startTime) - minutesOf(b.startTime) ||
    a.order - b.order ||
    a.id - b.id
  );
}

/**
 * その日（期タイプ）の出勤枠。学年帯をまたいで時刻順に並べる。
 * 講師のシフト希望の入力欄と、自動作成が回る単位はこれ。
 */
export function periodsOfDay(
  periods: PeriodLite[],
  termKind: string,
): PeriodLite[] {
  return periods.filter((p) => p.termKind === termKind).sort(byTime);
}

/**
 * その学年帯が、登録が無いときに代わりに使う帯。
 *
 * **高校生は、専用の時間割が無ければ中学生と同じ枠を使う。**
 * 高校生は中学生と同じ時間に通うことが多く、その場合に同じ時刻のコマを
 * 中用・高用と二重に登録させると、入力が増えるうえに
 * 「同じ時刻に別のコマがある」状態になって、同時に入れない判定（H14）が
 * 毎回引っかかる。登録しない、で済むようにしておく。
 */
const BAND_FALLBACK: Record<string, string[]> = {
  [GRADE_BAND.ELEM]: [GRADE_BAND.ALL],
  [GRADE_BAND.JUNIOR]: [GRADE_BAND.ALL],
  [GRADE_BAND.HIGH]: [GRADE_BAND.JUNIOR, GRADE_BAND.ALL],
  [GRADE_BAND.ALL]: [],
};

/**
 * その学年が使うコマ。
 *
 * 学年帯そのもののコマが無ければ、上の BAND_FALLBACK の順に探す。
 * どれも無ければ空を返す。**空になるのは「まだ登録していない」ということ**なので、
 * 呼ぶ側は黙って0件として扱わず、登録を促すこと。
 */
export function periodsForGrade(
  periods: PeriodLite[],
  grade: string,
  termKind: string,
): PeriodLite[] {
  const ofKind = periods.filter((p) => p.termKind === termKind);
  const band = bandOfGrade(grade);
  for (const b of [band, ...(BAND_FALLBACK[band] ?? [GRADE_BAND.ALL])]) {
    const hit = ofKind.filter((p) => p.gradeBand === b);
    if (hit.length > 0) return hit.sort(byTime);
  }
  return [];
}

/** 期タイプ × 学年帯 でまとめる。登録画面はこの単位で表を出す。 */
export function groupByBand(
  periods: PeriodLite[],
  termKind: string,
): Map<string, PeriodLite[]> {
  const out = new Map<string, PeriodLite[]>();
  for (const p of periods) {
    if (p.termKind !== termKind) continue;
    out.set(p.gradeBand, [...(out.get(p.gradeBand) ?? []), p]);
  }
  for (const [k, v] of out) out.set(k, [...v].sort(byTime));
  return out;
}

/**
 * 同じ期タイプの中で、時間帯が重なっているコマの組。
 *
 * 学年帯が違えば重なっていても授業としては成立する（小と中を並行して開ける）。
 * ただし**その2コマに同じ講師は入れない**ので、自動作成の前に気づいておきたい。
 * 同じ学年帯の中での重なりは、ほぼ入力の間違い。
 */
export type OverlapPair = { a: PeriodLite; b: PeriodLite; sameBand: boolean };

export function overlappingPairs(periods: PeriodLite[]): OverlapPair[] {
  const out: OverlapPair[] = [];
  const byKind = new Map<string, PeriodLite[]>();
  for (const p of periods) {
    byKind.set(p.termKind, [...(byKind.get(p.termKind) ?? []), p]);
  }

  for (const list of byKind.values()) {
    const sorted = [...list].sort(byTime);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // 時刻順に並んでいるので、始まりが前のコマの終わり以降になったら以降も重ならない
        if (minutesOf(sorted[j].startTime) >= minutesOf(sorted[i].endTime)) break;
        if (!overlaps(sorted[i], sorted[j])) continue;
        out.push({
          a: sorted[i],
          b: sorted[j],
          sameBand: sorted[i].gradeBand === sorted[j].gradeBand,
        });
      }
    }
  }
  return out;
}

/**
 * 連続しているか（間の空きが gapMinutes 以内）。
 * 連続コマ上限（H8）を時刻で見るために使う。コマ番号で見ると、
 * 学年帯をまたいだときに「小2限のあと中1限」が連続だと分からない。
 */
export function isBackToBack(
  earlier: TimeSpan,
  later: TimeSpan,
  gapMinutes = 30,
): boolean {
  const gap = minutesOf(later.startTime) - minutesOf(earlier.endTime);
  return gap >= 0 && gap <= gapMinutes;
}

/**
 * 表示用の名前を作る関数を返す。
 *
 * 学年帯を分けている塾では、同じ日に「1限」が2つ（小1限と中1限）並ぶ。
 * 名前だけ出すと同じ列が2つあるように見えるので、**複数の帯が混ざるときだけ**
 * 「小」「中」を頭に付ける。1つの帯しか無い塾では今までどおり「1限」のまま。
 */
export function periodLabeler(
  periods: PeriodLite[],
): (p: PeriodLite) => string {
  const multi = new Set(periods.map((x) => x.gradeBand)).size > 1;
  return (p) =>
    multi ? `${GRADE_BAND_SHORT[p.gradeBand] ?? ""}${p.name}` : p.name;
}

/** 盤面のように幅が無いところ用。「小1」「中3」のように2文字にする。 */
export function periodShortLabeler(
  periods: PeriodLite[],
): (p: PeriodLite) => string {
  const multi = new Set(periods.map((x) => x.gradeBand)).size > 1;
  return (p) =>
    multi
      ? `${GRADE_BAND_SHORT[p.gradeBand] ?? ""}${p.order + 1}`
      : String(p.order + 1);
}

/** その日の最初のコマか（列の区切り線を引く位置を決めるのに使う） */
export function isFirstOfDay(periods: PeriodLite[], p: PeriodLite): boolean {
  const sorted = [...periods].sort(byTime);
  return sorted.length > 0 && sorted[0].id === p.id;
}
