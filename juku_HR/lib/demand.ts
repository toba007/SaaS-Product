/**
 * 必要人数（需要）まわり。
 *
 * 需要は「講師4人」ではなく「英語2人・数学1人」で持つ。
 * 科目を見ずに人数だけ合わせると、誰も英語を教えられないシフトが
 * 「正常」として確定できてしまう。
 *
 * ここでいちばん大事なのは、**自動作成を回す前に人が足りるかを示す**こと。
 * 実行して初めて「英語が埋まりません」と分かるのでは遅い。
 *
 * 集計は Prisma に依存しない純粋関数にしてある。
 */

import { SHIFT } from "./constants";
import { parseSubjectKey } from "./subjects";

export type SubjectLite = { id: number; name: string };
export type DemandLite = {
  date: string;
  periodId: number;
  subjectId: number;
  /** その1人が教えられる必要のある科目すべて。空なら subjectId 1つだけ */
  subjectIds?: string;
  format: string;
  required: number;
};
/** 講師が出した希望。status が NG 以外なら「出られる」 */
export type RequestLite = {
  teacherId: number;
  date: string;
  periodId: number;
  status: string;
};
export type TeacherSubjectLite = { teacherId: number; subjectId: number };

export type SubjectBalance = {
  subjectId: number;
  name: string;
  /** 必要な延べコマ数 */
  required: number;
  /**
   * その科目を担当できる講師が「出られる」と答えた延べコマ数。
   *
   * **上限の目安であって、実際に使える量ではない。**
   * 1人の講師が同じコマで担当できる科目は1つだけなので、
   * 英語も数学も教えられる講師は両方の供給に数えられている。
   * 「この数字を下回っていれば安心」ではなく、
   * 「この数字を超えていたら確実に足りない」という使い方をする。
   */
  supplyUpperBound: number;
  /** 供給の上限を需要が超えている。確実に埋まらない。 */
  short: boolean;
  /** 担当できる講師が1人もいない。自動作成が実行できない（P8） */
  noTeacher: boolean;
};

/** 「出られる」と答えているか（未回答は含まない） */
function isAvailable(r: RequestLite): boolean {
  return r.status !== SHIFT.NG;
}

/** その需要の行が、その科目を教えられる人を求めているか。 */
function needsSubject(d: DemandLite, subjectId: number): boolean {
  const ids = parseSubjectKey(d.subjectIds ?? "");
  return ids.length > 0 ? ids.includes(subjectId) : d.subjectId === subjectId;
}

/**
 * 科目ごとに、必要な延べコマ数と供給の上限を並べる。
 *
 * 需要が設定されていない科目も行として出す（0件と分かるように）。
 */
export function balanceBySubject(
  subjects: SubjectLite[],
  demands: DemandLite[],
  requests: RequestLite[],
  links: TeacherSubjectLite[],
): SubjectBalance[] {
  // 「その日そのコマに出られる講師」の集合をあらかじめ作る
  const availableBySlot = new Map<string, Set<number>>();
  for (const r of requests) {
    if (!isAvailable(r)) continue;
    const key = `${r.date}:${r.periodId}`;
    const set = availableBySlot.get(key) ?? new Set<number>();
    set.add(r.teacherId);
    availableBySlot.set(key, set);
  }

  return subjects.map((s) => {
    const canTeach = new Set(
      links.filter((l) => l.subjectId === s.id).map((l) => l.teacherId),
    );
    // **複数科目を求める行は、その全部の科目に数える。**
    // 「英と数の組」を英語の行にだけ数えると、数学を教えられる人が
    // 足りていなくても気づけない。担当できる人は両方できる必要がある。
    const mine = demands.filter((d) => needsSubject(d, s.id));
    const required = mine.reduce((sum, d) => sum + d.required, 0);

    // 需要のあるコマだけを見る。誰も来ない日の空き枠を供給に数えても意味がない。
    let supplyUpperBound = 0;
    for (const key of new Set(mine.map((d) => `${d.date}:${d.periodId}`))) {
      const avail = availableBySlot.get(key);
      if (!avail) continue;
      for (const t of avail) if (canTeach.has(t)) supplyUpperBound++;
    }

    return {
      subjectId: s.id,
      name: s.name,
      required,
      supplyUpperBound,
      short: required > supplyUpperBound,
      noTeacher: required > 0 && canTeach.size === 0,
    };
  });
}

/**
 * 期間全体の総量。
 *
 * 科目別の供給は重複を含むので、全体が足りているかは別に数える。
 * こちらは「延べ何コマ働いてもらう必要があるか」と
 * 「延べ何コマ出られると言われているか」の素直な比較になる。
 */
export function totalBalance(
  demands: DemandLite[],
  requests: RequestLite[],
): { required: number; available: number; short: boolean } {
  const required = demands.reduce((s, d) => s + d.required, 0);
  const available = requests.filter(isAvailable).length;
  return { required, available, short: required > available };
}

/** 日 × コマ ごとの必要人数の合計。盤面の見出しに出す。 */
export function requiredBySlot(demands: DemandLite[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of demands) {
    const key = `${d.date}:${d.periodId}`;
    out.set(key, (out.get(key) ?? 0) + d.required);
  }
  return out;
}

/** 日 × コマ の内訳（科目別）。セルの詳細に出す。 */
export function breakdownOfSlot(
  demands: DemandLite[],
  date: string,
  periodId: number,
): DemandLite[] {
  return demands.filter((d) => d.date === date && d.periodId === periodId);
}
