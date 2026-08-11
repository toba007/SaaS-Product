/**
 * 割当のハード制約（H1〜H13）の検証。
 *
 * 自動作成エンジンと、盤面の手修正の**両方から呼ぶ**。
 * 画面で押せなくするのは見た目の話でしかなく、フォームの値は書き換えられるので、
 * 書き込む側で必ず通す（既存の lib/shifts.ts が isClosedDate() で同じことをしている）。
 *
 * Prisma に依存しない。エンジンが1件ずつ DB を引くと 3,000 件で終わらなくなるため、
 * 呼ぶ側が一度だけデータを集めて RuleContext を作り、あとはメモリ上で判定する。
 */

import { SHIFT } from "./constants";
import { weekStart } from "./dates";
import { byTime, isBackToBack, overlaps } from "./periods";

// ---------- 入力 ----------

/**
 * コマ。**時刻まで持つ。**
 *
 * 学年帯ごとに時間割が分かれると、コマ番号（order）だけでは判定できない。
 * 「小2限」と「中1限」はどちらも order が違う別系列なので、番号で見ると
 * 連続しているかも、同時刻かも分からない。時刻で見る。
 */
export type PeriodLite = {
  id: number;
  order: number;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
};

/**
 * 「続けて入っている」とみなす空き時間の上限（分）。
 * 小2限(〜19:05) と 中1限(19:15〜) のように、学年帯をまたぐと10分ほど空く。
 * ここを0にすると、実際には休みなく5コマ続いていても連続と数えられない。
 */
const BACK_TO_BACK_GAP_MIN = 30;

export type ShiftRule = {
  maxPerDay: number;
  maxPerWeek: number;
  maxConsecutive: number;
  minPerWeek: number;
};

export type TeacherState = {
  id: number;
  name: string;
  active: boolean;
  rule: ShiftRule;
  /** 担当できる科目 */
  subjects: Set<number>;
};

export type AssignmentLite = {
  teacherId: number;
  date: string;
  periodId: number;
  subjectId: number | null;
};

/** これから入れようとしている割当 */
export type Candidate = {
  teacherId: number;
  date: string;
  periodId: number;
  subjectId: number;
};

/**
 * 判定のモード。
 *
 * auto  … 自動作成。すべて error として弾く。
 * manual… 人が盤面で直すとき。当日の欠員など自動化が想定しない事態に
 *          対応できるよう、一部を warning に落とす（要件「エラー時でも手動で修正できる」）。
 */
export type CheckMode = "auto" | "manual";

// ---------- 出力 ----------

export type Severity = "error" | "warning";

export type Violation = {
  /** 要件定義の H 番号と対応させる。追跡できるように文字列で持つ。 */
  code:
    | "H1_NG"
    | "H2_UNANSWERED"
    | "H3_CLOSED"
    | "H5_OVER_DEMAND"
    | "H6_MAX_PER_DAY"
    | "H7_MAX_PER_WEEK"
    | "H8_MAX_CONSECUTIVE"
    | "H9_INACTIVE"
    | "H12_SUBJECT"
    | "H13_DOUBLE_BOOKED"
    | "H14_OVERLAP";
  severity: Severity;
  message: string;
};

/** error が1件も無ければ保存してよい */
export function isAllowed(violations: Violation[]): boolean {
  return !violations.some((v) => v.severity === "error");
}

// ---------- 文脈 ----------

export type RuleContext = {
  teachers: Map<number, TeacherState>;
  periods: Map<number, PeriodLite>;
  /** "teacherId:date:periodId" -> OK | PREFER | NG。無い＝未回答 */
  requests: Map<string, string>;
  closedDates: Set<string>;
  /** "date:periodId:subjectId" -> 必要人数 */
  required: Map<string, number>;
  /** 現在の割当。ここに候補を足していく */
  assignments: AssignmentLite[];
};

export function slotKey(date: string, periodId: number): string {
  return `${date}:${periodId}`;
}

function requestKey(teacherId: number, date: string, periodId: number): string {
  return `${teacherId}:${date}:${periodId}`;
}

export function demandKey(
  date: string,
  periodId: number,
  subjectId: number,
): string {
  return `${date}:${periodId}:${subjectId}`;
}

export function buildContext(input: {
  teachers: TeacherState[];
  periods: PeriodLite[];
  requests: { teacherId: number; date: string; periodId: number; status: string }[];
  closedDates: string[];
  demands: { date: string; periodId: number; subjectId: number; required: number }[];
  assignments: AssignmentLite[];
}): RuleContext {
  const required = new Map<string, number>();
  for (const d of input.demands) {
    const k = demandKey(d.date, d.periodId, d.subjectId);
    // 同じ科目でも形態が違えば別行になるので、足し合わせる
    required.set(k, (required.get(k) ?? 0) + d.required);
  }

  return {
    teachers: new Map(input.teachers.map((t) => [t.id, t])),
    periods: new Map(input.periods.map((p) => [p.id, p])),
    requests: new Map(
      input.requests.map((r) => [requestKey(r.teacherId, r.date, r.periodId), r.status]),
    ),
    closedDates: new Set(input.closedDates),
    required,
    assignments: [...input.assignments],
  };
}

// ---------- 集計（エンジンからも使う） ----------

/** その講師のその日の割当数 */
export function countOnDay(ctx: RuleContext, teacherId: number, date: string): number {
  return ctx.assignments.filter((a) => a.teacherId === teacherId && a.date === date)
    .length;
}

/** その講師のその週（日曜〜土曜）の割当数 */
export function countInWeek(ctx: RuleContext, teacherId: number, date: string): number {
  const start = weekStart(date);
  return ctx.assignments.filter(
    (a) => a.teacherId === teacherId && weekStart(a.date) === start,
  ).length;
}

/**
 * その日に periodId を足したときの、連続コマの最大長。
 *
 * **「連続」は時刻で見る。** コマ番号で見ると、小学生の2限のあとに中学生の1限が
 * 続く（18:25-19:05 → 19:15-20:05）ようなときに、番号が戻るので連続だと分からない。
 * 実際には休みなく続けて教えているので、ここを取りこぼすと連続上限が効かなくなる。
 *
 * 1限と3限に入っていても、間の2限が空いていれば連続ではない。
 */
export function maxRunWith(
  ctx: RuleContext,
  teacherId: number,
  date: string,
  periodId: number,
): number {
  const add = ctx.periods.get(periodId);
  if (!add) return 0;

  const used = new Map<number, PeriodLite>([[add.id, add]]);
  for (const a of ctx.assignments) {
    if (a.teacherId !== teacherId || a.date !== date) continue;
    const p = ctx.periods.get(a.periodId);
    if (p) used.set(p.id, p);
  }

  const sorted = [...used.values()].sort(byTime);
  let best = 0;
  let run = 0;
  let prev: PeriodLite | null = null;
  for (const p of sorted) {
    run =
      prev !== null && isBackToBack(prev, p, BACK_TO_BACK_GAP_MIN) ? run + 1 : 1;
    prev = p;
    if (run > best) best = run;
  }
  return best;
}

// ---------- 判定 ----------

/**
 * 割当を1件足してよいかを判定する。
 *
 * 外すこと（削除）は常に許すので、ここでは扱わない。
 * 休校が後から決まった場合に、残っている割当を片付けられなくなるため。
 */
export function checkAdd(
  ctx: RuleContext,
  cand: Candidate,
  mode: CheckMode = "auto",
): Violation[] {
  const v: Violation[] = [];
  const teacher = ctx.teachers.get(cand.teacherId);

  // 講師が存在しない・退職している
  if (!teacher || !teacher.active) {
    v.push({
      code: "H9_INACTIVE",
      severity: "error",
      message: "在籍していない講師です",
    });
    return v; // 以降の判定は意味がない
  }

  // H3 休校日
  if (ctx.closedDates.has(cand.date)) {
    v.push({
      code: "H3_CLOSED",
      severity: "error",
      message: `${cand.date} は休校日です`,
    });
  }

  // H1/H2 希望
  const status = ctx.requests.get(
    requestKey(cand.teacherId, cand.date, cand.periodId),
  );
  if (status === SHIFT.NG) {
    v.push({
      code: "H1_NG",
      severity: "error",
      message: `${teacher.name} は「出られない」と回答しています`,
    });
  } else if (status === undefined) {
    // 沈黙を承諾として扱わない。ただし当日の欠員対応では人が上書きできるようにする。
    v.push({
      code: "H2_UNANSWERED",
      severity: mode === "auto" ? "error" : "warning",
      message: `${teacher.name} はこのコマに回答していません`,
    });
  }

  // H12 担当科目
  if (!teacher.subjects.has(cand.subjectId)) {
    v.push({
      code: "H12_SUBJECT",
      severity: "error",
      message: `${teacher.name} はこの科目を担当できません`,
    });
  }

  // H13 同じコマに二重に入れない（科目が違っても同時には持てない）
  const doubleBooked = ctx.assignments.some(
    (a) =>
      a.teacherId === cand.teacherId &&
      a.date === cand.date &&
      a.periodId === cand.periodId,
  );
  if (doubleBooked) {
    v.push({
      code: "H13_DOUBLE_BOOKED",
      severity: "error",
      message: `${teacher.name} はこのコマに既に入っています`,
    });
  }

  // H14 別のコマでも、時間帯が重なっていれば同時には持てない。
  //
  // 学年帯ごとに時間割を分けると、「中1限」と「高1限」が同じ19:15開始、
  // ということが起きる。コマとしては別なので H13 は素通りしてしまうが、
  // 体は1つしかない。ここで止めないと、動けない予定が「正常」として確定できてしまう。
  const candPeriod = ctx.periods.get(cand.periodId);
  if (candPeriod && !doubleBooked) {
    const clash = ctx.assignments.find((a) => {
      if (a.teacherId !== cand.teacherId || a.date !== cand.date) return false;
      if (a.periodId === cand.periodId) return false;
      const other = ctx.periods.get(a.periodId);
      return other ? overlaps(candPeriod, other) : false;
    });
    if (clash) {
      const other = ctx.periods.get(clash.periodId);
      v.push({
        code: "H14_OVERLAP",
        severity: "error",
        message: `${teacher.name} は同じ時間帯の別のコマ（${other?.startTime}〜${other?.endTime}）に入っています`,
      });
    }
  }

  // H5 必要人数を超えない
  const need = ctx.required.get(
    demandKey(cand.date, cand.periodId, cand.subjectId),
  );
  if (need !== undefined) {
    const filled = ctx.assignments.filter(
      (a) =>
        a.date === cand.date &&
        a.periodId === cand.periodId &&
        a.subjectId === cand.subjectId,
    ).length;
    if (filled >= need) {
      v.push({
        code: "H5_OVER_DEMAND",
        severity: mode === "auto" ? "error" : "warning",
        message: `必要人数（${need}人）を超えます`,
      });
    }
  }

  // H6 1日の上限
  if (!doubleBooked) {
    const onDay = countOnDay(ctx, cand.teacherId, cand.date) + 1;
    if (onDay > teacher.rule.maxPerDay) {
      v.push({
        code: "H6_MAX_PER_DAY",
        severity: "error",
        message: `1日の上限（${teacher.rule.maxPerDay}コマ）を超えます`,
      });
    }

    // H7 週の上限
    const inWeek = countInWeek(ctx, cand.teacherId, cand.date) + 1;
    if (inWeek > teacher.rule.maxPerWeek) {
      v.push({
        code: "H7_MAX_PER_WEEK",
        severity: "error",
        message: `週の上限（${teacher.rule.maxPerWeek}コマ）を超えます`,
      });
    }

    // H8 連続コマの上限
    const run = maxRunWith(ctx, cand.teacherId, cand.date, cand.periodId);
    if (run > teacher.rule.maxConsecutive) {
      v.push({
        code: "H8_MAX_CONSECUTIVE",
        severity: "error",
        message: `連続の上限（${teacher.rule.maxConsecutive}コマ）を超えます`,
      });
    }
  }

  return v;
}

/** 判定して、通ったら文脈に反映する。エンジンが1件ずつ積むときに使う。 */
export function tryAdd(
  ctx: RuleContext,
  cand: Candidate,
  mode: CheckMode = "auto",
): { ok: boolean; violations: Violation[] } {
  const violations = checkAdd(ctx, cand, mode);
  const ok = isAllowed(violations);
  if (ok) {
    ctx.assignments.push({
      teacherId: cand.teacherId,
      date: cand.date,
      periodId: cand.periodId,
      subjectId: cand.subjectId,
    });
  }
  return { ok, violations };
}
