/**
 * 時間割を、塾で実際に使われている表の形に組み替える。
 *
 * ---- なぜ専用の変換が要るのか ----
 * 内部では配置を「対象 → 曜日 × コマ」の一覧で持っている。
 * ところが現場で配られている時間割は、**時間帯を縦、曜日を横に取り、
 * その中を教室（集団）や講師（個別）で列に割った表**になっている。
 * 一覧のままでは「火曜2限に何がどれだけ立つのか」が読み取れない。
 *
 * ---- 集団と個別で列の意味が違う ----
 * 集団は1クラス＝1教室なので、**列は教室**。1セルにクラス名が入る。
 * 個別は1人の講師が複数の生徒を同時にみるので、**列は講師**。
 * 1セルに生徒が最大 indivMaxStudents 人ぶん積まれる。
 *
 * ---- 講師はまだ決まっていない ----
 * この段階で決めているのは「いつ開講するか」まで。誰が担当するかは
 * シフトの自動作成が後で決める。だから列の見出しは「教室A」「講師1」に留める。
 * 埋まっていない列を空欄で見せることに意味がある（あと何枠使えるか分かる）。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { byTime, type PeriodLite } from "./periods";
import { packGroups, type Groupable } from "./indiv-groups";

/** 表に出す1件。集団はクラス、個別は生徒1人ぶん。 */
export type ViewItem = {
  /** 配置の id。画面から外すときに使う */
  id: number;
  targetKey: string;
  kind: "CLASS" | "INDIV";
  subjectId: number;
  /** 「中3英語Ⅱ」「中3 山田太郎」 */
  name: string;
  /** 個別の科目名など、名前の後ろに小さく出すもの */
  note: string;
  dayOfWeek: number;
  periodId: number;
  /** AI が付けた理由 */
  reason: string;
  /** 人が後から足したか */
  byHand: boolean;
  /**
   * 個別の組。0 なら未定で、その場合はここで機械的に束ねる。
   * 決まっていればその通りに並べる（**人が組み替えた結果を消さない**）。
   */
  groupNo?: number;
  /** StudentSubject.id。組を決めるときの識別に使う。集団は 0 */
  linkId?: number;
};

/** 表の1マス。列1つぶん。 */
export type ViewCell = {
  /** 「中3英語Ⅱ」（集団）／「英語」（個別の講師1人ぶん） */
  title: string;
  /** 個別の組番号。枠の中で 1 から。集団は 0 */
  groupNo?: number;
  items: ViewItem[];
};

export type ViewRow = {
  period: PeriodLite;
  /** 曜日 -> その曜日に並ぶ列 */
  byDay: Map<number, ViewCell[]>;
};

export type Grid = {
  rows: ViewRow[];
  /** 1曜日あたりの列数。どの曜日もこの数だけ列を描く */
  columns: number;
};

/**
 * 集団の表。**1クラス＝1列（1教室）。**
 *
 * 列数は「同時に使える集団教室の数」と「実際に立つクラスの最大数」の
 * 大きいほうにする。上限より多く立っていたら、それが見えないと直せない。
 */
export function buildGroupGrid(
  items: ViewItem[],
  periods: PeriodLite[],
  days: number[],
  maxGroupRooms: number,
): Grid {
  const groups = items.filter((i) => i.kind === "CLASS");
  const rows: ViewRow[] = [];
  let widest = 0;

  for (const period of [...periods].sort(byTime)) {
    const byDay = new Map<number, ViewCell[]>();
    for (const d of days) {
      const here = groups
        .filter((i) => i.dayOfWeek === d && i.periodId === period.id)
        .sort((a, b) => a.subjectId - b.subjectId || a.name.localeCompare(b.name));
      const cells = here.map((i) => ({ title: i.name, items: [i] }));
      widest = Math.max(widest, cells.length);
      byDay.set(d, cells);
    }
    rows.push({ period, byDay });
  }

  return { rows, columns: Math.max(1, maxGroupRooms, widest) };
}

/**
 * 個別の表。**1列＝講師1人。上限まで生徒をまとめる。**
 *
 * ---- 科目では分けない ----
 * 現物の時間割では、1つの列に「中3(理) 中3(理) 中1(数) 中3(理)」のように
 * **違う科目の生徒が並ぶ。** 巡回して1人ずつ見る指導なので、科目を揃える必要が無い。
 * 科目で列を割ると、実際より多くの講師が要ることになってしまう。
 *
 * 「1対1」を希望している生徒は他の生徒と一緒にできないので、1人で1列を占める。
 * ここは必要人数の数え方（lib/schedule.ts）と揃えてある。ずれると
 * 「表では3列なのに必要人数は2人」という食い違いが出る。
 *
 * ---- 決まっている組はそのまま出す ----
 * 人が組み替えた結果（groupNo）があれば**その通りに並べる。**
 * ここで束ね直すと、開くたびに組が変わって「決めた」ことにならない。
 * 束ねる判断そのものは lib/indiv-groups.ts に置いてあり、
 * 必要人数の計算と同じ関数を使う。
 */
export function buildIndivGrid(
  items: ViewItem[],
  periods: PeriodLite[],
  days: number[],
  indivMaxStudents: number,
  /** 1対1を希望している対象。targetKey の集合 */
  soloKeys: Set<string>,
  /** 科目名。列の見出しに出す */
  subjectName: (id: number) => string,
  /** 科目の系統（文系／理系）。組を寄せる向きが決まる */
  streamOf?: (id: number) => string,
): Grid {
  const cap = Math.max(1, Math.trunc(indivMaxStudents) || 1);
  const indiv = items.filter((i) => i.kind === "INDIV");
  const rows: ViewRow[] = [];
  let widest = 0;

  for (const period of [...periods].sort(byTime)) {
    const byDay = new Map<number, ViewCell[]>();

    for (const d of days) {
      const here = indiv.filter((i) => i.dayOfWeek === d && i.periodId === period.id);

      // 決まっていない組を埋める。決まっているものはそのまま残る。
      const groupable: Groupable[] = here.map((i) => ({
        studentSubjectId: i.linkId ?? i.id,
        subjectId: i.subjectId,
        stream: streamOf?.(i.subjectId),
        solo: soloKeys.has(i.targetKey),
        groupNo: i.groupNo ?? 0,
      }));
      const noOf = packGroups(groupable, cap);

      // 組番号ごとにまとめる。番号の小さい順に列を並べる。
      const byGroup = new Map<number, ViewItem[]>();
      for (const i of here) {
        const no = noOf.get(i.linkId ?? i.id) ?? 0;
        byGroup.set(no, [...(byGroup.get(no) ?? []), i]);
      }

      const cells: ViewCell[] = [];
      for (const no of [...byGroup.keys()].sort((a, b) => a - b)) {
        const list = [...(byGroup.get(no) ?? [])].sort(
          (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
        );
        // 見出しはその組に入っている科目。**1つとは限らない。**
        // 「英・数」と並ぶので、担当する講師が何を教えられる必要があるかが分かる。
        const subjects = [...new Set(list.map((i) => i.subjectId))]
          .sort((a, b) => a - b)
          .map((id) => subjectName(id).slice(0, 1));
        cells.push({ title: subjects.join("・"), groupNo: no, items: list });
      }

      widest = Math.max(widest, cells.length);
      byDay.set(d, cells);
    }

    rows.push({ period, byDay });
  }

  return { rows, columns: Math.max(1, widest) };
}

/** 「A」「B」… 集団の教室につける記号。実際の教室名は決めていないので位置の名前。 */
export function roomLabel(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return `R${index + 1}`;
}
