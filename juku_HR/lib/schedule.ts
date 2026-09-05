/**
 * 受講予定から必要人数を出す。
 *
 * ---- ここが「必要人数の手入力」を消す部分 ----
 * これまでは管理者が「火曜2限は英語2人」と手で入れていた。
 * 実際にはその情報は既にある：クラスが立っていて、生徒の受講予定が入っていれば、
 * **必要人数は数えれば出る。**
 *
 * ---- 集団と個別で数え方が違う ----
 * 集団は「開講しているクラスの数」。生徒が5人でも20人でも講師は1人。
 * 個別は「生徒の数 ÷ 同時にみられる人数」。ここは塾の設定で変わる。
 *
 * ---- 1対1を希望している生徒は、まとめない ----
 * 「1対1」で取っている生徒を他の生徒と同じ枠に詰めると、契約と違う授業になる。
 * その生徒は1人で1コマを占有する数え方にしてある。安全側（講師が多めに要る側）。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { LESSON_STYLE, indivSizeOf } from "./constants";
import { dayOfWeek } from "./dates";
import { packGroups, type Groupable } from "./indiv-groups";
import { subjectKey } from "./subjects";

/** 個別の配置。曜日（レギュラー）か日付（講習）のどちらか一方を持つ。 */
export type ScheduleLite = {
  studentSubjectId: number;
  /** 0=日..6=土。日付で持つときは null */
  dayOfWeek: number | null;
  /** "YYYY-MM-DD"。曜日で持つときは null */
  date: string | null;
  periodId: number;
  fromDate: string;
  toDate: string;
  /**
   * 組（誰と一緒に見るか）。0 なら未定。
   *
   * 決まっていれば**組の数**で講師を数える。未定なら、これまでどおり
   * `1対1の人数 + ceil(残り ÷ 上限)` で見積もる。lib/indiv-groups.ts 参照。
   */
  groupNo?: number;
};

/** 生徒が取っている科目（量）。 */
export type SubjectLinkLite = {
  id: number;
  studentId: number;
  subjectId: number;
  format: string;
  slotsPerWeek: number;
  active: boolean;
};

/** その日にこの配置の授業があるか。 */
export function scheduledOn(s: ScheduleLite, date: string): boolean {
  if (date < s.fromDate || date > s.toDate) return false;
  // 日付指定（講習）はその日だけ
  if (s.date !== null) return s.date === date;
  // 曜日指定（レギュラー）は毎週
  if (s.dayOfWeek !== null) return dayOfWeek(date) === s.dayOfWeek;
  // どちらも無い行は壊れている。黙って毎日開講することにはしない。
  return false;
}

export type DemandRow = {
  date: string;
  periodId: number;
  /** 代表科目。並び替えと集計に使う */
  subjectId: number;
  /**
   * **その1人が教えられる必要のある科目すべて。** "3,7"（昇順・重複なし）
   *
   * 集団は1科目。個別は**1人の講師が違う科目の生徒を同時に見る**ので複数になる。
   * 需要の行はこの集合ごとに分ける。代表科目で束ねると
   * 「英だけの組」と「英と数の組」が同じ行になってしまう。
   */
  subjectIds: string;
  format: string;
  required: number;
};

/**
 * 個別の必要人数。
 *
 * ---- 組が決まっていれば、数えるだけ ----
 * 「誰と誰を同じ講師が見るか」が決まっている生徒は、**組の数がそのまま人数**。
 * 決まっていないぶんだけ、まとめられる人数で割って見積もる。
 * 「1対1」の生徒は1人ずつ数える。
 *
 * 例：上限4人の塾で、英語の火曜2限に 1対1 が1人・その他が5人（組は未定）
 *     → 1 + ceil(5 / 4) = 3人の講師が要る
 *
 * ---- なぜ概算のままにしないのか ----
 * 概算は**組める前提**で数えている。実際には「この2人は分けたい」といった
 * 事情があり、そのぶん講師は多く要る。組を決めたなら、その数で数えるほうが正しい。
 *
 * ---- 数えるのは「組」。科目ではない ----
 * **1人の講師が違う科目の生徒を同時に見る**（巡回指導）。現物の時間割で
 * 1つの列に「理・理・数・理」と並ぶのを確かめた。だから科目ごとに数えると、
 * 英・数・理の3人を1人が見る組が**3人必要**ということになってしまう。
 *
 * 数えるのは組の数。**代わりに「その組の科目を全部教えられる人」でなければ
 * ならない**という条件が付くので、必要な科目の集合を行に持たせる。
 */
export function individualDemand(
  links: SubjectLinkLite[],
  schedules: ScheduleLite[],
  dates: string[],
  indivMaxStudents: number,
): DemandRow[] {
  const cap = Math.max(1, Math.trunc(indivMaxStudents) || 1);
  const linkById = new Map(links.map((l) => [l.id, l]));

  // "date:periodId" -> その枠に入っている生徒（科目はまたぐ）
  const acc = new Map<string, Groupable[]>();

  for (const date of dates) {
    for (const s of schedules) {
      const link = linkById.get(s.studentSubjectId);
      if (!link || !link.active) continue;
      // 集団はクラスの時間割で数えるので、ここでは扱わない
      if (link.format === LESSON_STYLE.GROUP) continue;
      if (!scheduledOn(s, date)) continue;

      // **科目はキーに入れない。** 組は科目をまたぐので、枠ごとにまとめて割る。
      const key = `${date}:${s.periodId}`;
      acc.set(key, [
        ...(acc.get(key) ?? []),
        {
          studentSubjectId: link.id,
          subjectId: link.subjectId,
          solo: indivSizeOf(link.format) === 1,
          groupNo: s.groupNo ?? 0,
        },
      ]);
    }
  }

  // 枠ごとに組へ割り、**同じ科目の組み合わせを要求する組**をまとめて1行にする。
  // 「英と数の組が2つ」なら required=2。担当できる講師の条件が同じだからまとめられる。
  const rows = new Map<string, DemandRow>();

  for (const [key, members] of acc) {
    const [date, periodId] = key.split(":");
    const noOf = packGroups(members, cap);

    const bySlotGroup = new Map<number, Groupable[]>();
    for (const m of members) {
      const no = noOf.get(m.studentSubjectId) ?? 0;
      bySlotGroup.set(no, [...(bySlotGroup.get(no) ?? []), m]);
    }

    for (const list of bySlotGroup.values()) {
      const ids = subjectKey(list.map((m) => m.subjectId));
      const rowKey = `${date}:${periodId}:${ids}`;
      const cur = rows.get(rowKey);
      if (cur) {
        cur.required++;
        continue;
      }
      rows.set(rowKey, {
        date,
        periodId: Number(periodId),
        // 代表は集合のいちばん小さい科目。並びを決めるためだけに使う。
        subjectId: list.map((m) => m.subjectId).sort((a, b) => a - b)[0],
        subjectIds: ids,
        // 需要の形態は「個別」を代表して 1対n で持つ。給与の形態は実績側で決まる。
        format: LESSON_STYLE.INDIV_2,
        required: 1,
      });
    }
  }

  return sortDemand([...rows.values()]);
}

/** 集団と個別を足し合わせる。同じ枠・同じ科目なら合算する。 */
export function mergeDemand(...groups: DemandRow[][]): DemandRow[] {
  const acc = new Map<string, DemandRow>();
  for (const rows of groups) {
    for (const r of rows) {
      const key = `${r.date}:${r.periodId}:${r.subjectIds}:${r.format}`;
      const cur = acc.get(key);
      if (cur) cur.required += r.required;
      else acc.set(key, { ...r });
    }
  }
  return sortDemand([...acc.values()]);
}

/** 実行のたびに並びが変わらないようにする */
export function sortDemand(rows: DemandRow[]): DemandRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.periodId - b.periodId ||
      a.subjectId - b.subjectId ||
      a.subjectIds.localeCompare(b.subjectIds) ||
      a.format.localeCompare(b.format),
  );
}

// ---------- 不備の検出 ----------

/**
 * 「週2コマ受けたい」と言っているのに、1コマしか配置されていない生徒。
 *
 * **これは黙って0件として扱ってはいけない。** 配置し忘れた生徒は、
 * 必要人数に数えられないまま授業の日を迎える。
 * 集団の「未配属の生徒」（lib/classes.ts）と同じ位置づけ。
 */
export type Shortfall = {
  studentSubjectId: number;
  studentId: number;
  subjectId: number;
  /** 受けたいコマ数 */
  want: number;
  /** 実際に配置されているコマ数 */
  placed: number;
};

export function schedulingShortfalls(
  links: SubjectLinkLite[],
  schedules: ScheduleLite[],
  /** 数える対象の期間。ここに重なる配置だけを数える */
  from: string,
  to: string,
): Shortfall[] {
  const placed = new Map<number, number>();
  for (const s of schedules) {
    // 期間がまったく重ならない配置（前の学期のもの）は数えない
    if (s.toDate < from || s.fromDate > to) continue;
    placed.set(s.studentSubjectId, (placed.get(s.studentSubjectId) ?? 0) + 1);
  }

  const out: Shortfall[] = [];
  for (const l of links) {
    if (!l.active) continue;
    // 集団はクラスへの振り分けで見る。ここは個別だけ。
    if (l.format === LESSON_STYLE.GROUP) continue;
    const got = placed.get(l.id) ?? 0;
    if (got >= l.slotsPerWeek) continue;
    out.push({
      studentSubjectId: l.id,
      studentId: l.studentId,
      subjectId: l.subjectId,
      want: l.slotsPerWeek,
      placed: got,
    });
  }

  return out.sort((a, b) => a.studentId - b.studentId || a.subjectId - b.subjectId);
}

/**
 * 同じ生徒が、同じ枠に2つ入っている。
 *
 * 「火曜2限に英語と数学」は体が1つなので成立しない。
 * 配置を人が決めるうちは起きうるので、確定の前に気づけるようにする。
 */
export type StudentClash = {
  studentId: number;
  dayOfWeek: number | null;
  date: string | null;
  periodId: number;
  subjectIds: number[];
};

export function studentClashes(
  links: SubjectLinkLite[],
  schedules: ScheduleLite[],
): StudentClash[] {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const acc = new Map<string, { s: ScheduleLite; studentId: number; subjects: number[] }>();

  for (const s of schedules) {
    const link = linkById.get(s.studentSubjectId);
    if (!link || !link.active) continue;
    const slot = s.date !== null ? `d${s.date}` : `w${s.dayOfWeek}`;
    const key = `${link.studentId}:${slot}:${s.periodId}`;
    const cur = acc.get(key);
    if (cur) cur.subjects.push(link.subjectId);
    else acc.set(key, { s, studentId: link.studentId, subjects: [link.subjectId] });
  }

  return [...acc.values()]
    .filter((v) => v.subjects.length > 1)
    .map((v) => ({
      studentId: v.studentId,
      dayOfWeek: v.s.dayOfWeek,
      date: v.s.date,
      periodId: v.s.periodId,
      subjectIds: [...v.subjects].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.studentId - b.studentId || a.periodId - b.periodId);
}
