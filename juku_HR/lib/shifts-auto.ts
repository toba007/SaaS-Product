/**
 * 出勤シフトの自動割当エンジン（段階2）。
 *
 * Prisma にも Next.js にも依存しない純粋関数。DB を用意せずにテストできるようにするため、
 * また「同じ入力なら同じ結果」を確かめるのに副作用があると邪魔になるため。
 *
 * ---- なぜ最適化ソルバーを使わないか ----
 * 線形計画や制約充足ソルバーを使えば最適解が得られるが、
 *   (a) 依存パッケージが増える
 *   (b)「なぜこの人がこのコマなのか」を現場に説明できない
 *   (c) 制約が少し変わると解が大きく飛び、先月と全く違うシフトが出て混乱する
 * この機能はそもそも「シフトを組む人の忖度をなくす」ために作っている。
 * 忖度というブラックボックスを別のブラックボックスに置き換えては意味がない。
 * **最適性より、説明可能性と安定性を優先する。**
 *
 * ---- 再現性 ----
 * 乱数を使わない。同点は必ず decided な順序で解く（最後は teacherId 昇順）。
 * 実行するたびに結果が変わると「やり直せば有利な結果が出る」と疑われ、
 * 公平性の主張そのものが崩れる。
 */

import { SHIFT } from "./constants";
import { parseSubjectKey } from "./subjects";
import {
  buildContext,
  checkAdd,
  countOnDay,
  countInWeek,
  isAllowed,
  maxRunWith,
  type AssignmentLite,
  type PeriodLite,
  type RuleContext,
  type TeacherState,
} from "./shifts-rules";

// ---------- 重み ----------

export type Weights = {
  /** 公平性。まだ割当の少ない講師を優先する（主目的） */
  fair: number;
  /** その科目の専門・得意な講師を優先する */
  subject: number;
  /** ◎できれば入りたい を ○出られる より優先する */
  prefer: number;
  /** 週の最低コマ数に届いていない講師を優先する */
  minWeek: number;
  /** 細切れ出勤を避け、連続したコマにまとめる */
  continuity: number;
  /** 同じ日に詰め込みすぎない */
  load: number;
  /** 希少な科目を持つ講師を、誰でも教えられる科目に使わない */
  scarce: number;
};

/**
 * 既定値。画面から変更できる。
 *
 * **実データが無い状態での推定値**なので、運用しながら調整する前提
 * （要件定義 7.7.3「仮置きした事項」）。
 */
export const DEFAULT_WEIGHTS: Weights = {
  fair: 1.0,
  subject: 0.5,
  prefer: 0.4,
  minWeek: 0.6,
  continuity: 0.25,
  load: 0.3,
  scarce: 0.35,
};

// ---------- 入出力 ----------

export type DemandRow = {
  date: string;
  periodId: number;
  /** 代表科目。並び順と集計に使う */
  subjectId: number;
  /**
   * **その1人が教えられる必要のある科目すべて。** "3,7"（昇順・重複なし）
   *
   * 個別は1人の講師が違う科目の生徒を同時に見るので、複数になることがある。
   * 空なら subjectId 1つだけを要求しているものとして扱う（古い行との互換）。
   */
  subjectIds?: string;
  format: string;
  required: number;
};

export type RequestRow = {
  teacherId: number;
  date: string;
  periodId: number;
  status: string;
};

export type AutoInput = {
  teachers: TeacherState[];
  periods: PeriodLite[];
  requests: RequestRow[];
  closedDates: string[];
  demands: DemandRow[];
  /** 再実行しても動かさない既存の割当（H10） */
  locked?: AssignmentLite[];
  weights?: Partial<Weights>;
  /** 講師の担当科目の習熟度。"teacherId:subjectId" -> 1..3 */
  levels?: Map<string, number>;
};

export type Placement = {
  teacherId: number;
  date: string;
  periodId: number;
  subjectId: number;
  format: string;
  /** なぜこの人が選ばれたかの根拠 */
  score: number;
};

export type UnfilledReason =
  | "NO_CANDIDATE"
  | "NO_SUBJECT_TEACHER"
  | "ALL_AT_LIMIT"
  | "DEMAND_EXCEEDS_SUPPLY"
  | "LOCKED_BLOCKED";

export type Unfilled = {
  date: string;
  periodId: number;
  subjectId: number;
  format: string;
  shortage: number;
  reason: UnfilledReason;
};

export type TeacherLoad = {
  teacherId: number;
  name: string;
  /** 出られると答えたコマ数 */
  available: number;
  /** 実際に入れたコマ数 */
  assigned: number;
  /** 希望のうち何割入れたか。希望0なら null */
  fillRate: number | null;
};

export type AutoResult = {
  placements: Placement[];
  unfilled: Unfilled[];
  loads: TeacherLoad[];
  summary: {
    requiredTotal: number;
    placedTotal: number;
    /** 割当済み ÷ 必要人数 */
    fillRate: number;
    /** 割当コマ数の最大 − 最小（希望を出した講師のみ）。偏りの目安 */
    spread: number;
    /** 科目ごとの 必要 / 割当 */
    bySubject: { subjectId: number; required: number; placed: number }[];
  };
  elapsedMs: number;
};

// ---------- 内部 ----------

type Slot = DemandRow & {
  /** まだ埋まっていない人数 */
  remaining: number;
  /** そのコマに出られて、その科目を担当できる講師 */
  candidates: number[];
};

function levelKey(teacherId: number, subjectId: number): string {
  return `${teacherId}:${subjectId}`;
}

/**
 * その需要の行が求める科目。
 *
 * subjectIds があればそれ。無ければ代表科目1つ（古い行との互換）。
 * lib/subjects.ts の subjectKey が作った形をほどく。
 */
function requiredSubjects(d: { subjectId: number; subjectIds?: string }): number[] {
  const ids = parseSubjectKey(d.subjectIds ?? "");
  return ids.length > 0 ? ids : [d.subjectId];
}

/**
 * その需要に対する講師の習熟度。**複数科目なら、いちばん低い科目に合わせる。**
 *
 * 英が専門でも理が「可」なら、その組を持ったときに困るのは理の生徒。
 * 平均にすると得意科目で薄めてしまうので、弱いほうを見る。
 */
function levelFor(
  levels: Map<string, number>,
  teacherId: number,
  d: { subjectId: number; subjectIds?: string },
): number {
  const need = requiredSubjects(d);
  let min = 3;
  for (const sid of need) min = Math.min(min, levels.get(levelKey(teacherId, sid)) ?? 1);
  return min;
}

/**
 * 科目の希少度。1に近いほど担当できる人が少ない。
 * 「英語も理科もできる講師」を英語に先に取られると理科が埋まらなくなるので、
 * 希少な科目を持つ講師は、誰でも教えられる科目には後回しにする。
 */
function scarcityBySubject(teachers: TeacherState[]): Map<number, number> {
  const total = teachers.length || 1;
  const counts = new Map<number, number>();
  for (const t of teachers) {
    for (const s of t.subjects) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const out = new Map<number, number>();
  for (const [subjectId, n] of counts) out.set(subjectId, 1 - n / total);
  return out;
}

/** その講師が担当する科目の希少度の平均 */
function teacherScarcity(t: TeacherState, scarcity: Map<number, number>): number {
  if (t.subjects.size === 0) return 0;
  let sum = 0;
  for (const s of t.subjects) sum += scarcity.get(s) ?? 0;
  return sum / t.subjects.size;
}

// ---------- 本体 ----------

export function generate(input: AutoInput): AutoResult {
  const startedAt = Date.now();
  const w = { ...DEFAULT_WEIGHTS, ...input.weights };
  const levels = input.levels ?? new Map<string, number>();
  const closed = new Set(input.closedDates);
  const active = input.teachers.filter((t) => t.active);

  // --- フェーズ0: 前処理 ---

  const ctx = buildContext({
    teachers: input.teachers,
    periods: input.periods,
    requests: input.requests,
    closedDates: input.closedDates,
    demands: input.demands,
    assignments: input.locked ?? [],
  });

  // 出られると答えたコマ数。充足率の分母になる。
  const availableCount = new Map<number, number>();
  for (const r of input.requests) {
    if (r.status === SHIFT.NG) continue;
    if (closed.has(r.date)) continue;
    availableCount.set(r.teacherId, (availableCount.get(r.teacherId) ?? 0) + 1);
  }

  // ロック済みのぶんを初期値にする
  const assignedCount = new Map<number, number>();
  for (const a of input.locked ?? []) {
    assignedCount.set(a.teacherId, (assignedCount.get(a.teacherId) ?? 0) + 1);
  }

  const scarcity = scarcityBySubject(active);
  const scarcityOf = new Map(
    active.map((t) => [t.id, teacherScarcity(t, scarcity)] as const),
  );

  // 「その日そのコマに出られる講師」
  const availableAtSlot = new Map<string, Set<number>>();
  for (const r of input.requests) {
    if (r.status === SHIFT.NG) continue;
    const k = `${r.date}:${r.periodId}`;
    const set = availableAtSlot.get(k) ?? new Set<number>();
    set.add(r.teacherId);
    availableAtSlot.set(k, set);
  }

  // 対象スロットを作る。休校日と required=0 は最初から外す。
  const slots: Slot[] = [];
  for (const d of input.demands) {
    if (d.required <= 0) continue;
    if (closed.has(d.date)) continue;

    // ロック済みで既に埋まっているぶんを差し引く
    const lockedHere = (input.locked ?? []).filter(
      (a) => a.date === d.date && a.periodId === d.periodId && a.subjectId === d.subjectId,
    ).length;
    const remaining = d.required - lockedHere;

    const avail = availableAtSlot.get(`${d.date}:${d.periodId}`) ?? new Set<number>();

    // **その行が求める科目を全部教えられる人だけ。**
    // 個別は1人が違う科目の生徒を同時に見るので、1科目できるだけでは足りない。
    const need = requiredSubjects(d);
    const candidates = active
      .filter((t) => avail.has(t.id) && need.every((sid) => t.subjects.has(sid)))
      .map((t) => t.id)
      .sort((a, b) => a - b); // 決定的に

    slots.push({ ...d, remaining: Math.max(0, remaining), candidates });
  }

  // --- フェーズ1: 貪欲割当 ---
  //
  // 制約の厳しいスロットから埋める。候補者数が少ない順にすると、
  // 「理科を教えられるのは2人だけ」といった希少なコマが先に確保される。
  // 科目のために特別な優先ルールを足す必要はない。
  const order = [...slots].sort(
    (a, b) =>
      a.candidates.length - b.candidates.length ||
      b.remaining - a.remaining ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (ctx.periods.get(a.periodId)?.order ?? 0) - (ctx.periods.get(b.periodId)?.order ?? 0) ||
      a.subjectId - b.subjectId ||
      a.format.localeCompare(b.format),
  );

  const placements: Placement[] = [];

  for (const slot of order) {
    while (slot.remaining > 0) {
      const picked = pickBest(slot);
      if (picked === null) break;

      placements.push(picked);
      ctx.assignments.push({
        teacherId: picked.teacherId,
        date: picked.date,
        periodId: picked.periodId,
        subjectId: picked.subjectId,
      });
      assignedCount.set(
        picked.teacherId,
        (assignedCount.get(picked.teacherId) ?? 0) + 1,
      );
      slot.remaining--;
    }
  }

  /** そのスロットに入れられる候補の中から、評価値がいちばん高い1人を選ぶ */
  function pickBest(slot: Slot): Placement | null {
    let best: { teacherId: number; score: number; level: number; available: number } | null =
      null;

    for (const id of slot.candidates) {
      const t = ctx.teachers.get(id);
      if (!t) continue;

      // ハード制約を通らない候補は最初から外す
      const violations = checkAdd(
        ctx,
        { teacherId: id, date: slot.date, periodId: slot.periodId, subjectId: slot.subjectId },
        "auto",
      );
      if (!isAllowed(violations)) continue;

      const score = scoreOf(t, slot);
      const level = levelFor(levels, id, slot);
      const available = availableCount.get(id) ?? 0;

      if (best === null) {
        best = { teacherId: id, score, level, available };
        continue;
      }
      // 同点処理。ここを固定しないと実行のたびに結果が変わる。
      //   1. score 降順
      //   2. その科目の習熟度 降順（専門を優先）
      //   3. 出られると答えたコマ数 昇順（貴重な候補を使い切らない）
      //   4. teacherId 昇順（最終的な決定打。乱数は使わない）
      const better =
        score > best.score + 1e-9 ||
        (Math.abs(score - best.score) <= 1e-9 &&
          (level > best.level ||
            (level === best.level &&
              (available < best.available ||
                (available === best.available && id < best.teacherId)))));
      if (better) best = { teacherId: id, score, level, available };
    }

    if (best === null) return null;
    return {
      teacherId: best.teacherId,
      date: slot.date,
      periodId: slot.periodId,
      subjectId: slot.subjectId,
      format: slot.format,
      score: Number(best.score.toFixed(4)),
    };
  }

  /** 要件定義 7.5.5 の評価式 */
  function scoreOf(t: TeacherState, slot: Slot): number {
    const avail = availableCount.get(t.id) ?? 0;
    const done = assignedCount.get(t.id) ?? 0;
    const fillRate = avail === 0 ? 1 : done / avail;

    const level = levelFor(levels, t.id, slot);
    const status = ctx.requests.get(`${t.id}:${slot.date}:${slot.periodId}`);

    const weekCount = countInWeek(ctx, t.id, slot.date);
    const dayCount = countOnDay(ctx, t.id, slot.date);
    // 隣接コマに既に入っていれば連続になる（maxRunWith が2以上を返す）
    const continuous = maxRunWith(ctx, t.id, slot.date, slot.periodId) >= 2 ? 1 : 0;

    return (
      w.fair * (1 - fillRate) +
      w.subject * ((level - 1) / 2) +
      w.prefer * (status === SHIFT.PREFER ? 1 : 0) +
      w.minWeek * (weekCount < t.rule.minPerWeek ? 1 : 0) +
      w.continuity * continuous -
      w.load * (t.rule.maxPerDay > 0 ? dayCount / t.rule.maxPerDay : 0) -
      w.scarce * (scarcityOf.get(t.id) ?? 0)
    );
  }

  // --- フェーズ3: 結果の生成 ---

  const unfilled: Unfilled[] = slots
    .filter((s) => s.remaining > 0)
    .map((s) => ({
      date: s.date,
      periodId: s.periodId,
      subjectId: s.subjectId,
      format: s.format,
      shortage: s.remaining,
      reason: reasonFor(s, ctx, availableAtSlot, active, input.locked ?? []),
    }))
    .sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        (ctx.periods.get(a.periodId)?.order ?? 0) -
          (ctx.periods.get(b.periodId)?.order ?? 0) ||
        a.subjectId - b.subjectId,
    );

  const loads: TeacherLoad[] = active
    .map((t) => {
      const avail = availableCount.get(t.id) ?? 0;
      const done = assignedCount.get(t.id) ?? 0;
      return {
        teacherId: t.id,
        name: t.name,
        available: avail,
        assigned: done,
        fillRate: avail === 0 ? null : done / avail,
      };
    })
    .sort((a, b) => a.teacherId - b.teacherId);

  const requiredTotal = slots.reduce((s, x) => s + x.required, 0);
  const placedTotal = placements.length + (input.locked ?? []).length;

  const bySubjectMap = new Map<number, { required: number; placed: number }>();
  for (const s of slots) {
    const cur = bySubjectMap.get(s.subjectId) ?? { required: 0, placed: 0 };
    cur.required += s.required;
    bySubjectMap.set(s.subjectId, cur);
  }
  for (const p of placements) {
    const cur = bySubjectMap.get(p.subjectId) ?? { required: 0, placed: 0 };
    cur.placed++;
    bySubjectMap.set(p.subjectId, cur);
  }

  return {
    placements,
    unfilled,
    loads,
    summary: {
      requiredTotal,
      placedTotal,
      fillRate: requiredTotal === 0 ? 1 : placedTotal / requiredTotal,
      spread: spreadOf(loads),
      bySubject: [...bySubjectMap.entries()]
        .map(([subjectId, v]) => ({ subjectId, ...v }))
        .sort((a, b) => a.subjectId - b.subjectId),
    },
    elapsedMs: Date.now() - startedAt,
  };
}

/**
 * 埋まらなかった理由を1つ選ぶ。
 * 理由の無い未充足は出さない。「なぜ埋まらないのか」が分からないと現場が対処できない。
 */
function reasonFor(
  slot: Slot,
  ctx: RuleContext,
  availableAtSlot: Map<string, Set<number>>,
  active: TeacherState[],
  locked: AssignmentLite[],
): UnfilledReason {
  const avail = availableAtSlot.get(`${slot.date}:${slot.periodId}`) ?? new Set<number>();

  // そもそも誰も出られない
  if (avail.size === 0) return "NO_CANDIDATE";

  // 出られる人はいるが、誰もその科目を担当できない。
  // 「人は足りているのに、その科目が教えられない」を名指しできるようにする。
  if (slot.candidates.length === 0) return "NO_SUBJECT_TEACHER";

  // ロック済みの割当が需要枠を占有している
  const lockedHere = locked.filter(
    (a) =>
      a.date === slot.date &&
      a.periodId === slot.periodId &&
      a.subjectId === slot.subjectId,
  ).length;
  if (lockedHere > 0 && slot.candidates.length <= lockedHere) return "LOCKED_BLOCKED";

  // 候補者数がそもそも必要人数に足りない
  if (slot.candidates.length < slot.required) return "DEMAND_EXCEEDS_SUPPLY";

  // 候補はいるが、上限などで全員弾かれた
  return "ALL_AT_LIMIT";
}

/** 偏りの目安。割当コマ数の最大と最小の差（希望を出している講師のみ） */
export function spreadOf(loads: TeacherLoad[]): number {
  const activeLoads = loads.filter((l) => l.available > 0);
  if (activeLoads.length === 0) return 0;
  const counts = activeLoads.map((l) => l.assigned);
  return Math.max(...counts) - Math.min(...counts);
}
