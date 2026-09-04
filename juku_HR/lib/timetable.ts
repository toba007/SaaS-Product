/**
 * 開講時間割。「中3英語Ⅰは毎週火曜2限」「田中さんの国語は木曜1限」を決める。
 *
 * ---- ここが業務のいちばん重いところ ----
 * 塾では、クラスや受講科目は決まっていても**いつ開講するかは決まっていない**。
 * 担当できる講師がいつ来られるかを見て決め、そのあと生徒に「火曜2限に来てね」と伝える。
 * いまはこれを人が手で突き合わせている。
 *
 * ---- LLM は提案するだけ。正しさはここが決める ----
 * 提案を LLM に出させる場合でも、**通してよいかの判定はこのファイルが行う。**
 * LLM は「出られない講師しかいない枠」を平気で提案するし、同じ生徒を同時刻に
 * 2つ置くこともある。それを「正しい」として確定させないための関門。
 *
 * 同じ理由で、**LLM 無しでも時間割が出せる**ようにしてある（greedyPlace）。
 * 提案が使えなかったときに何も出ないのでは、業務が止まる。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { GRADE_BAND, SHIFT } from "./constants";
import { dayOfWeek } from "./dates";

// ---------- 入力 ----------

/** 週の枠。時間割はこの単位で決まる。 */
export type Slot = { dayOfWeek: number; periodId: number };

export function slotKey(s: Slot): string {
  return `${s.dayOfWeek}:${s.periodId}`;
}

export type PeriodLite = {
  id: number;
  gradeBand: string;
  name: string;
  startTime: string;
  endTime: string;
  order: number;
};

/**
 * 時間割に置きたいもの。集団のクラスと、個別の生徒×科目を同じ形で扱う。
 *
 * 集団は「1クラス＝講師1人」、個別は「生徒を上限までまとめて講師1人」。
 * 数え方は違うが、**置き場所を決める**という点では同じ問題なので1つにする。
 */
export type Target = {
  /** "class:3" / "indiv:12"。LLM に渡すので、実行のたびに変わらない値にする */
  key: string;
  kind: "CLASS" | "INDIV";
  /** ClassGroup.id または StudentSubject.id */
  refId: number;
  /** 画面と LLM に見せる名前。個別は仮名にしてから渡す */
  label: string;
  subjectId: number;
  /** 学年帯。使えるコマがこれで決まる */
  gradeBand: string;
  /** この授業に出る生徒。同じ生徒が同時刻に2つ入らないようにするため */
  studentIds: number[];
  /** 週に何コマ置くか */
  slots: number;
  /** 個別で1対1を希望している。他の生徒とまとめられない */
  solo?: boolean;
};

/** 決まった配置。 */
export type Placement = Slot & { targetKey: string };

/** その枠に出られて、その科目を担当できる講師 */
export type Availability = Map<string, Set<number>>;

// ---------- 講師がいつ来られるか ----------

export type RequestLite = {
  teacherId: number;
  date: string;
  periodId: number;
  status: string;
};

/**
 * 日付ごとの希望を、週の枠に畳む。
 *
 * **時間割は毎週同じ枠で回る。** だから「その曜日のそのコマに毎回出られる」人しか
 * 候補にできない。4回中3回だけ出られる講師をクラス担当にすると、残り1回が必ず穴になる。
 *
 * 未回答は「出られる」に数えない（黙っていたら入れられていた、を防ぐ既存の方針と同じ）。
 * 分母は休校日を除いた開講日。呼ぶ側で除いてから渡す。
 */
export type WeeklyAvailability = {
  /** "dow:periodId" -> teacherId -> { 出られる回数, 判定の対象になった回数 } */
  counts: Map<string, Map<number, { ok: number; total: number }>>;
  /**
   * "dow:periodId" -> { 回答があった回数, 期間内の回数 }。
   * 判定にどれだけの根拠があるかを画面に出すために持つ。
   */
  coverage: Map<string, { answered: number; total: number }>;
};

/**
 * 日付ごとの希望を、週の枠に畳む。
 *
 * ---- 分母は「回答が集まっている回」だけ ----
 * 学期は3か月以上あるのに、希望は1か月ぶんしか出ていない、ということが普通に起きる。
 * このとき**回答が無い週まで分母に入れると、誰も「毎回出られる」ことにならない。**
 * 回答が無いのは「出られない」証拠ではなく、まだ聞けていないだけ。
 *
 * そこで、その曜日×コマについて**誰かが回答した回**だけを分母にする。
 * どれだけの根拠で判定したかは coverage に残し、画面で「4/15週ぶんの回答」と出せるようにする。
 *
 * 回答した人の中では、未回答を「出られる」に数えない方針は変えない
 * （黙っていたら入れられていた、を防ぐ既存の方針と同じ）。
 */
export function foldWeekly(
  requests: RequestLite[],
  dates: string[],
  periodIds: number[],
): WeeklyAvailability {
  const counts = new Map<string, Map<number, { ok: number; total: number }>>();
  const coverage = new Map<string, { answered: number; total: number }>();
  const periodSet = new Set(periodIds);
  const dateSet = new Set(dates);

  // 回答があった (日付, コマ)。ここが分母になる。
  const answered = new Set<string>();
  for (const r of requests) {
    if (!dateSet.has(r.date) || !periodSet.has(r.periodId)) continue;
    answered.add(`${r.date}:${r.periodId}`);
  }

  for (const d of dates) {
    for (const pid of periodSet) {
      const k = `${dayOfWeek(d)}:${pid}`;
      const cur = coverage.get(k) ?? { answered: 0, total: 0 };
      cur.total++;
      if (answered.has(`${d}:${pid}`)) cur.answered++;
      coverage.set(k, cur);
    }
  }

  const teachers = new Set(requests.map((r) => r.teacherId));
  for (const [k, c] of coverage) {
    const m = new Map<number, { ok: number; total: number }>();
    for (const t of teachers) m.set(t, { ok: 0, total: c.answered });
    counts.set(k, m);
  }

  for (const r of requests) {
    if (!dateSet.has(r.date) || !periodSet.has(r.periodId)) continue;
    if (r.status === SHIFT.NG) continue;
    const k = `${dayOfWeek(r.date)}:${r.periodId}`;
    const entry = counts.get(k)?.get(r.teacherId);
    if (entry) entry.ok++;
  }

  return { counts, coverage };
}

/**
 * 毎回出られる講師だけを候補にする。
 *
 * 分母は foldWeekly が数えた「回答があった回」。回答が1回も無い枠は候補ゼロになる。
 * ratio を下げると「ほぼ毎回出られる人」も候補にできるが、既定は 1（回答した回はすべて OK）。
 * 穴が空く時間割を作らないため、緩めるのは人が判断してからにする。
 */
export function reliableTeachers(
  w: WeeklyAvailability,
  slot: Slot,
  ratio = 1,
): Set<number> {
  const out = new Set<number>();
  const m = w.counts.get(slotKey(slot));
  if (!m) return out;
  for (const [teacherId, { ok, total }] of m) {
    if (total === 0) continue;
    if (ok / total >= ratio) out.add(teacherId);
  }
  return out;
}

/** その枠に置ける講師（科目も担当できる人だけ）を、枠ごとにまとめる。 */
export function buildAvailability(
  w: WeeklyAvailability,
  slots: Slot[],
  subjectId: number,
  canTeach: (teacherId: number, subjectId: number) => boolean,
  ratio = 1,
): Availability {
  const out: Availability = new Map();
  for (const s of slots) {
    const set = new Set<number>();
    for (const t of reliableTeachers(w, s, ratio)) {
      if (canTeach(t, subjectId)) set.add(t);
    }
    out.set(slotKey(s), set);
  }
  return out;
}

// ---------- 制約 ----------

export type ViolationCode =
  /** 学年帯に合わないコマ（小学生を中学生の時間帯に置いた） */
  | "T1_BAND"
  /** その枠に、その科目を担当できて毎回出られる講師がいない */
  | "T2_NO_TEACHER"
  /** 同じ生徒が同じ枠に2つ入っている */
  | "T3_STUDENT_CLASH"
  /** 同時刻の開講数が教室数を超えた */
  | "T4_OVER_ROOMS"
  /** 週に置くコマ数が合っていない */
  | "T5_SLOT_COUNT"
  /** その枠に必要な人数の講師がいない（1人はいるが足りない） */
  | "T7_TEACHER_SHORTAGE"
  /** 知らない対象・知らないコマを指している（LLM の作り話） */
  | "T6_UNKNOWN";

export type Violation = {
  code: ViolationCode;
  targetKey: string;
  slot?: Slot;
  message: string;
};

export type CheckInput = {
  targets: Target[];
  periods: PeriodLite[];
  /** targetKey -> その対象が置ける枠（buildAvailability の結果） */
  availability: Map<string, Availability>;
  maxGroupRooms: number;
  maxIndivRooms: number;
  /** 個別で1人の講師がみられる上限 */
  indivMaxStudents: number;
  /**
   * "dow:periodId" -> その枠に毎回出られる講師（科目は問わない）。
   *
   * **1人の講師は同時に1か所にしかいられない。** 科目ごとに「担当できる人がいる」
   * ことを確かめても、その枠ぜんぶで人数が足りるかは分からない。
   * 省略しても動くが、渡すと人数不足を検出できる。
   */
  slotTeachers?: Map<string, Set<number>>;
};

/**
 * 配置ぜんぶを検証する。**LLM の提案はここを必ず通す。**
 *
 * 1件ずつではなく全体で見るのは、教室数の上限と生徒の重複が
 * 「他の配置との関係」でしか判定できないため。
 */
export function checkPlacements(
  placements: Placement[],
  input: CheckInput,
): Violation[] {
  const v: Violation[] = [];
  const targetByKey = new Map(input.targets.map((t) => [t.key, t]));
  const periodById = new Map(input.periods.map((p) => [p.id, p]));

  // --- 1件ずつ見る ---
  for (const p of placements) {
    const target = targetByKey.get(p.targetKey);
    if (!target) {
      v.push({
        code: "T6_UNKNOWN",
        targetKey: p.targetKey,
        slot: p,
        message: `${p.targetKey} は対象に含まれていません`,
      });
      continue;
    }
    const period = periodById.get(p.periodId);
    if (!period || p.dayOfWeek < 0 || p.dayOfWeek > 6) {
      v.push({
        code: "T6_UNKNOWN",
        targetKey: p.targetKey,
        slot: p,
        message: `${target.label}：存在しないコマ・曜日を指しています`,
      });
      continue;
    }

    // T1 学年帯。小学生のクラスを中学生の時間帯に置かない
    if (
      period.gradeBand !== GRADE_BAND.ALL &&
      target.gradeBand !== GRADE_BAND.ALL &&
      period.gradeBand !== target.gradeBand &&
      !fallsBackTo(target.gradeBand, period.gradeBand)
    ) {
      v.push({
        code: "T1_BAND",
        targetKey: p.targetKey,
        slot: p,
        message: `${target.label} は ${period.name}（${period.gradeBand}）の時間帯では開講できません`,
      });
    }

    // T2 担当できて毎回出られる講師がいるか
    const canWork = input.availability.get(p.targetKey)?.get(slotKey(p));
    if (!canWork || canWork.size === 0) {
      v.push({
        code: "T2_NO_TEACHER",
        targetKey: p.targetKey,
        slot: p,
        message: `${target.label}：この枠に毎回出られる担当講師がいません`,
      });
    }
  }

  // --- 全体で見る ---
  const valid = placements.filter((p) => targetByKey.has(p.targetKey));

  // T5 週のコマ数
  const placedCount = new Map<string, number>();
  for (const p of valid) {
    placedCount.set(p.targetKey, (placedCount.get(p.targetKey) ?? 0) + 1);
  }
  for (const t of input.targets) {
    const got = placedCount.get(t.key) ?? 0;
    if (got === t.slots) continue;
    v.push({
      code: "T5_SLOT_COUNT",
      targetKey: t.key,
      message: `${t.label}：週${t.slots}コマのはずが${got}コマです`,
    });
  }

  // T3 同じ生徒が同じ枠に2つ
  const byStudent = new Map<string, string[]>();
  for (const p of valid) {
    const t = targetByKey.get(p.targetKey)!;
    for (const sid of t.studentIds) {
      const k = `${sid}:${slotKey(p)}`;
      byStudent.set(k, [...(byStudent.get(k) ?? []), t.label]);
    }
  }
  const clashSeen = new Set<string>();
  for (const [k, labels] of byStudent) {
    if (labels.length < 2) continue;
    const [sid, dow, pid] = k.split(":");
    const dedup = `${dow}:${pid}:${labels.join("/")}`;
    if (clashSeen.has(dedup)) continue;
    clashSeen.add(dedup);
    v.push({
      code: "T3_STUDENT_CLASH",
      targetKey: "",
      slot: { dayOfWeek: Number(dow), periodId: Number(pid) },
      message: `生徒${sid} が同じ枠で ${labels.join(" と ")} に入っています`,
    });
  }

  // T4 教室数。同じ枠に同時に開けるクラス数・ブース数の上限
  const rooms = new Map<string, { group: number; indiv: number }>();
  for (const p of valid) {
    const t = targetByKey.get(p.targetKey)!;
    const k = slotKey(p);
    const cur = rooms.get(k) ?? { group: 0, indiv: 0 };
    if (t.kind === "CLASS") cur.group++;
    else cur.indiv++;
    rooms.set(k, cur);
  }
  for (const [k, { group }] of rooms) {
    const [dow, pid] = k.split(":").map(Number);
    if (group > input.maxGroupRooms) {
      v.push({
        code: "T4_OVER_ROOMS",
        targetKey: "",
        slot: { dayOfWeek: dow, periodId: pid },
        message: `同時に${group}クラス開こうとしています（集団教室は${input.maxGroupRooms}室）`,
      });
    }
    // 個別は生徒をまとめられるので、必要なブース数は人数から出す
    const booths = neededBooths(
      valid.filter((p) => slotKey(p) === k),
      targetByKey,
      input.indivMaxStudents,
    );
    if (booths > input.maxIndivRooms) {
      v.push({
        code: "T4_OVER_ROOMS",
        targetKey: "",
        slot: { dayOfWeek: dow, periodId: pid },
        message: `個別に${booths}ブース必要ですが、${input.maxIndivRooms}室しかありません`,
      });
    }
  }

  // T7 人数が足りるか。
  //
  // T2 は「1人でもいるか」しか見ない。個別を7人まとめると2ブース＝講師2人が要るので、
  // 担当できる講師が1人しかいなければ成立しない。**当日になって初めて分かるのでは遅い。**
  for (const [k, need] of neededTeachers(valid, targetByKey, input.indivMaxStudents)) {
    const [dow, pid, subjectId] = k.split(":").map(Number);
    const slot = { dayOfWeek: dow, periodId: pid };

    // その科目を担当できて、その枠に出られる人
    // 0人のときは T2 が「講師がいません」と言っているので、ここでは重ねて言わない。
    // 同じ1つの問題に2つのメッセージが出ると、直す箇所が2つあるように見える。
    const forSubject = firstAvailabilityOf(input, subjectId, slot);
    if (forSubject !== null && forSubject > 0 && need > forSubject) {
      v.push({
        code: "T7_TEACHER_SHORTAGE",
        targetKey: "",
        slot,
        message: `科目${subjectId}：この枠に講師が${need}人必要ですが、${forSubject}人しかいません`,
      });
    }
  }

  // 科目をまたいだ合計。1人の講師は同時に1か所にしかいられない。
  if (input.slotTeachers) {
    const totals = new Map<string, number>();
    for (const [k, need] of neededTeachers(valid, targetByKey, input.indivMaxStudents)) {
      const [dow, pid] = k.split(":");
      const sk = `${dow}:${pid}`;
      totals.set(sk, (totals.get(sk) ?? 0) + need);
    }
    for (const [sk, need] of totals) {
      const have = input.slotTeachers.get(sk)?.size ?? 0;
      // 同上。0人なら T2 の担当。
      if (have > 0 && need > have) {
        const [dow, pid] = sk.split(":").map(Number);
        v.push({
          code: "T7_TEACHER_SHORTAGE",
          targetKey: "",
          slot: { dayOfWeek: dow, periodId: pid },
          message: `この枠は合計${need}人の講師が必要ですが、出られるのは${have}人です`,
        });
      }
    }
  }

  return v;
}

/**
 * 枠 × 科目ごとに、何人の講師が要るか。
 * 集団は1クラス1人、個別は「1対1の人数 + ceil(まとめられる人数 ÷ 上限)」。
 */
function neededTeachers(
  placements: Placement[],
  targetByKey: Map<string, Target>,
  cap: number,
): Map<string, number> {
  const acc = new Map<string, { classes: number; solo: number; pooled: number }>();
  for (const p of placements) {
    const t = targetByKey.get(p.targetKey);
    if (!t) continue;
    const k = `${p.dayOfWeek}:${p.periodId}:${t.subjectId}`;
    const cur = acc.get(k) ?? { classes: 0, solo: 0, pooled: 0 };
    if (t.kind === "CLASS") cur.classes++;
    else if (t.solo) cur.solo += Math.max(1, t.studentIds.length);
    else cur.pooled += Math.max(1, t.studentIds.length);
    acc.set(k, cur);
  }

  const out = new Map<string, number>();
  for (const [k, { classes, solo, pooled }] of acc) {
    out.set(k, classes + solo + Math.ceil(pooled / Math.max(1, cap)));
  }
  return out;
}

/**
 * その科目・その枠に出られる講師の数。
 *
 * availability は対象ごとに持っているが、中身は「その科目を担当できて出られる人」なので、
 * 同じ科目の対象ならどれを見ても同じ。1つ見つけたらそれを使う。
 * その科目の対象が1つも無ければ null（判定しようがない）。
 */
function firstAvailabilityOf(
  input: CheckInput,
  subjectId: number,
  slot: Slot,
): number | null {
  for (const t of input.targets) {
    if (t.subjectId !== subjectId) continue;
    const set = input.availability.get(t.key)?.get(slotKey(slot));
    if (set) return set.size;
  }
  return null;
}

/** 高校生の登録が無ければ中学生の枠を使う、という既定の読み替え（lib/periods.ts と同じ） */
function fallsBackTo(targetBand: string, periodBand: string): boolean {
  if (targetBand === GRADE_BAND.HIGH && periodBand === GRADE_BAND.JUNIOR) return true;
  return false;
}

/** その枠で個別に必要なブース数。科目ごとに分け、1対1は1人で1ブース。 */
function neededBooths(
  inSlot: Placement[],
  targetByKey: Map<string, Target>,
  cap: number,
): number {
  const bySubject = new Map<number, { solo: number; pooled: number }>();
  for (const p of inSlot) {
    const t = targetByKey.get(p.targetKey);
    if (!t || t.kind !== "INDIV") continue;
    const cur = bySubject.get(t.subjectId) ?? { solo: 0, pooled: 0 };
    if (t.solo) cur.solo += t.studentIds.length;
    else cur.pooled += t.studentIds.length;
    bySubject.set(t.subjectId, cur);
  }
  let total = 0;
  for (const { solo, pooled } of bySubject.values()) {
    total += solo + Math.ceil(pooled / Math.max(1, cap));
  }
  return total;
}

export function isAllowed(violations: Violation[]): boolean {
  return violations.length === 0;
}

// ---------- 決定的な配置（LLM が使えないときの土台） ----------

export type PlaceResult = {
  placements: Placement[];
  /** 置けなかったもの。理由を付ける */
  unplaced: { targetKey: string; label: string; reason: string; needed: number }[];
};

/**
 * 制約を守る範囲で、機械的に置く。
 *
 * **LLM を使わずに時間割を出せることが目的。** 提案が使えなかったときや、
 * 比べる相手が要るときに使う。同じ入力なら必ず同じ結果になる。
 *
 * 置き方は「置ける枠が少ないものから順に、詰められる枠へ」。
 * 個別を同じ枠に寄せると1人の講師で複数みられるので、講師のコマ数が減る。
 */
export function greedyPlace(
  input: CheckInput,
  /** 先に決まっていて動かさない配置（人が決めた枠、前学期からの引き継ぎ） */
  fixed: Placement[] = [],
): PlaceResult {
  const targetByKey = new Map(input.targets.map((t) => [t.key, t]));
  const placements: Placement[] = [...fixed.filter((p) => targetByKey.has(p.targetKey))];
  const unplaced: PlaceResult["unplaced"] = [];

  const fixedCount = new Map<string, number>();
  for (const p of placements) {
    fixedCount.set(p.targetKey, (fixedCount.get(p.targetKey) ?? 0) + 1);
  }

  // 置ける枠が少ないものから。後回しにすると置き場所が無くなる。
  const order = [...input.targets]
    .map((t) => ({
      t,
      free: [...(input.availability.get(t.key)?.entries() ?? [])].filter(
        ([, set]) => set.size > 0,
      ).length,
    }))
    .sort((a, b) => a.free - b.free || a.t.key.localeCompare(b.t.key));

  for (const { t } of order) {
    let need = t.slots - (fixedCount.get(t.key) ?? 0);
    if (need <= 0) continue;

    const candidates = [...(input.availability.get(t.key)?.entries() ?? [])]
      .filter(([, set]) => set.size > 0)
      .map(([k]) => {
        const [dayOfWeek, periodId] = k.split(":").map(Number);
        return { dayOfWeek, periodId };
      });

    if (candidates.length === 0) {
      unplaced.push({
        targetKey: t.key,
        label: t.label,
        reason: "担当できて毎回出られる講師がいる枠がありません",
        needed: need,
      });
      continue;
    }

    // 同じ科目が既に置かれている枠を優先して詰める（個別は講師を共有できる）。
    // 同点は曜日・コマの順にして、実行のたびに結果が変わらないようにする。
    const scored = candidates
      .map((c) => ({
        c,
        packed: placements.filter((p) => {
          const o = targetByKey.get(p.targetKey);
          return (
            o &&
            o.subjectId === t.subjectId &&
            o.kind === t.kind &&
            slotKey(p) === slotKey(c)
          );
        }).length,
      }))
      .sort(
        (a, b) =>
          b.packed - a.packed ||
          a.c.dayOfWeek - b.c.dayOfWeek ||
          a.c.periodId - b.c.periodId,
      );

    for (const { c } of scored) {
      if (need === 0) break;
      // 同じ対象を同じ枠に2回置かない
      if (placements.some((p) => p.targetKey === t.key && slotKey(p) === slotKey(c))) {
        continue;
      }
      const trial = [...placements, { ...c, targetKey: t.key }];
      // 置いてみて、増えた違反が無ければ採用する
      const before = checkPlacements(placements, input).filter(
        (x) => x.code !== "T5_SLOT_COUNT",
      ).length;
      const after = checkPlacements(trial, input).filter(
        (x) => x.code !== "T5_SLOT_COUNT",
      ).length;
      if (after > before) continue;
      placements.push({ ...c, targetKey: t.key });
      need--;
    }

    if (need > 0) {
      unplaced.push({
        targetKey: t.key,
        label: t.label,
        reason:
          "置ける枠はありますが、生徒の重なりか教室数の上限で入りませんでした",
        needed: need,
      });
    }
  }

  return { placements: sortPlacements(placements), unplaced };
}

/** 実行のたびに並びが変わらないようにする */
export function sortPlacements(p: Placement[]): Placement[] {
  return [...p].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.periodId - b.periodId ||
      a.targetKey.localeCompare(b.targetKey),
  );
}
