/**
 * シフト計画の実行まわり。DB とエンジンをつなぐ層。
 *
 * エンジン（lib/shifts-auto.ts）は Prisma に依存しない純粋関数なので、
 * データを集めるのと結果を保存するのはここが担当する。
 *
 * 保存は1トランザクションで行う。途中で失敗したら実行前に戻す（要件 R3）。
 * 中途半端に書き込まれたシフトが残ると、現場は何が正しいか分からなくなる。
 */

// lib/dal.ts と違って "server-only" は付けない。
// 付けると検証スクリプト（scripts/verify-generate.ts）から import できなくなる。
// ここはトランザクションの塊なので、テストできることを優先する。
// クライアントに混ざる心配は、./prisma を辿った時点でビルドが落ちるので実害はない。
import { prisma } from "./prisma";
import { generate, type AutoResult, type Weights } from "./shifts-auto";
import type { AssignmentLite, PeriodLite, TeacherState } from "./shifts-rules";
import { datesBetween } from "./dates";
import {
  ASSIGNMENT_SOURCE,
  DEFAULT_SHIFT_RULE,
  PLAN_STATUS,
  SHIFT,
} from "./constants";
import { eventsBetween, isClosed } from "./events";
import { parseSubjectKey } from "./subjects";

export type GenerateMode = "FULL" | "FILL";

/** 実行前に満たしていること（要件 7.4.2 の P1〜P8） */
export type Precondition = { code: string; message: string };

export type GenerateOutcome =
  | { ok: false; blocked: Precondition[] }
  | { ok: true; result: AutoResult; warnings: string[] };

/**
 * 実行できるかを確かめる。
 * 満たさないものは理由を出して止める。中途半端な結果を出すより、
 * 何が足りないかを名指しするほうがよい。
 */
export async function checkPreconditions(planId: number): Promise<Precondition[]> {
  const blocked: Precondition[] = [];

  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan) return [{ code: "P0", message: "計画が見つかりません" }];

  if (plan.status !== PLAN_STATUS.DRAFT) {
    blocked.push({
      code: "P7",
      message: "確定済みのシフトは自動作成できません。変更するには確定を解除してください。",
    });
  }
  if (plan.fromDate > plan.toDate) {
    blocked.push({ code: "P1", message: "対象期間が正しくありません" });
  }

  const events = await eventsBetween(plan.fromDate, plan.toDate);
  const openDays = datesBetween(plan.fromDate, plan.toDate).filter(
    (d) => !isClosed(d, events),
  );
  if (openDays.length === 0) {
    blocked.push({ code: "P2", message: "対象期間がすべて休校日です" });
  }

  const [periodCount, demands, requestCount] = await Promise.all([
    prisma.period.count(),
    prisma.shiftDemand.findMany({ where: { planId, required: { gt: 0 } } }),
    prisma.shiftRequest.count({
      where: { date: { gte: plan.fromDate, lte: plan.toDate } },
    }),
  ]);

  if (periodCount === 0) {
    blocked.push({ code: "P3", message: "コマが登録されていません" });
  }
  if (demands.length === 0) {
    blocked.push({
      code: "P4",
      message: "必要人数が設定されていません。先に科目別の必要人数を入れてください。",
    });
  }
  if (requestCount === 0) {
    blocked.push({
      code: "P5",
      message: "この期間にシフト希望が1件も提出されていません",
    });
  }

  // P8: 需要にある科目を担当できる講師が1人もいないと、そこは絶対に埋まらない。
  // データの登録漏れであって自動作成で解決できる問題ではないので、実行前に止める。
  if (demands.length > 0) {
    // 組が複数科目を求めることがあるので、集合をほどいて全部見る
    const needed = [
      ...new Set(
        demands.flatMap((d) => {
          const ids = parseSubjectKey(d.subjectIds);
          return ids.length > 0 ? ids : [d.subjectId];
        }),
      ),
    ];
    const [links, subjects] = await Promise.all([
      prisma.teacherSubject.findMany({
        where: { subjectId: { in: needed }, teacher: { active: true } },
        select: { subjectId: true },
      }),
      prisma.subject.findMany({ where: { id: { in: needed } } }),
    ]);
    const covered = new Set(links.map((l) => l.subjectId));
    const missing = subjects.filter((s) => !covered.has(s.id));
    for (const s of missing) {
      blocked.push({
        code: "P8",
        message: `${s.name} を担当できる講師が登録されていません`,
      });
    }
  }

  return blocked;
}

/**
 * 自動作成を実行して保存する。
 *
 * mode=FULL … ロック以外を破棄して作り直す
 * mode=FILL … 既存の割当を残し、足りないところだけ埋める
 */
export async function runGenerate(
  planId: number,
  mode: GenerateMode = "FULL",
  weights?: Partial<Weights>,
): Promise<GenerateOutcome> {
  const blocked = await checkPreconditions(planId);
  if (blocked.length > 0) return { ok: false, blocked };

  const plan = await prisma.shiftPlan.findUniqueOrThrow({ where: { id: planId } });

  const [teachers, periods, requests, demands, existing, events, links, rules] =
    await Promise.all([
      prisma.teacher.findMany({ orderBy: { id: "asc" } }),
      prisma.period.findMany({ orderBy: [{ startTime: "asc" }, { id: "asc" }] }),
      prisma.shiftRequest.findMany({
        where: { date: { gte: plan.fromDate, lte: plan.toDate } },
      }),
      prisma.shiftDemand.findMany({ where: { planId, required: { gt: 0 } } }),
      prisma.shiftAssignment.findMany({
        where: { planId, date: { gte: plan.fromDate, lte: plan.toDate } },
      }),
      eventsBetween(plan.fromDate, plan.toDate),
      prisma.teacherSubject.findMany(),
      prisma.teacherShiftRule.findMany(),
    ]);

  const ruleOf = new Map(rules.map((r) => [r.teacherId, r]));
  const subjectsOf = new Map<number, Set<number>>();
  const levels = new Map<string, number>();
  for (const l of links) {
    const set = subjectsOf.get(l.teacherId) ?? new Set<number>();
    set.add(l.subjectId);
    subjectsOf.set(l.teacherId, set);
    levels.set(`${l.teacherId}:${l.subjectId}`, l.level);
  }

  const teacherStates: TeacherState[] = teachers.map((t) => {
    const r = ruleOf.get(t.id);
    return {
      id: t.id,
      name: t.name,
      active: t.active,
      rule: {
        maxPerDay: r?.maxPerDay ?? DEFAULT_SHIFT_RULE.maxPerDay,
        maxPerWeek: r?.maxPerWeek ?? DEFAULT_SHIFT_RULE.maxPerWeek,
        maxConsecutive: r?.maxConsecutive ?? DEFAULT_SHIFT_RULE.maxConsecutive,
        minPerWeek: r?.minPerWeek ?? DEFAULT_SHIFT_RULE.minPerWeek,
      },
      subjects: subjectsOf.get(t.id) ?? new Set<number>(),
    };
  });

  const periodLites: PeriodLite[] = periods.map((p) => ({
    id: p.id,
    order: p.order,
    startTime: p.startTime,
    endTime: p.endTime,
  }));
  const closedDates = datesBetween(plan.fromDate, plan.toDate).filter((d) =>
    isClosed(d, events),
  );

  // FULL でも locked は残す（H10）。FILL は既存すべてを動かさない。
  const keep = mode === "FULL" ? existing.filter((a) => a.locked) : existing;
  const keepLite: AssignmentLite[] = keep.map((a) => ({
    teacherId: a.teacherId,
    date: a.date,
    periodId: a.periodId,
    subjectId: a.subjectId,
  }));

  const result = generate({
    teachers: teacherStates,
    periods: periodLites,
    requests: requests.map((r) => ({
      teacherId: r.teacherId,
      date: r.date,
      periodId: r.periodId,
      status: r.status,
    })),
    closedDates,
    demands: demands.map((d) => ({
      date: d.date,
      periodId: d.periodId,
      subjectId: d.subjectId,
      // 個別の組は複数科目を求める。全部教えられる人だけが候補になる。
      subjectIds: d.subjectIds,
      format: d.format,
      required: d.required,
    })),
    locked: keepLite,
    weights,
    levels,
  });

  const keepIds = new Set(keep.map((a) => a.id));
  const removeIds = existing.filter((a) => !keepIds.has(a.id)).map((a) => a.id);

  // 1トランザクション。途中で失敗したら実行前の状態に戻る（R3）。
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { id: { in: removeIds } } }),
    ...result.placements.map((p) =>
      prisma.shiftAssignment.upsert({
        where: {
          teacherId_date_periodId: {
            teacherId: p.teacherId,
            date: p.date,
            periodId: p.periodId,
          },
        },
        create: {
          teacherId: p.teacherId,
          date: p.date,
          periodId: p.periodId,
          planId,
          subjectId: p.subjectId,
          format: p.format,
          source: ASSIGNMENT_SOURCE.AUTO,
          score: p.score,
        },
        update: {
          planId,
          subjectId: p.subjectId,
          format: p.format,
          source: ASSIGNMENT_SOURCE.AUTO,
          score: p.score,
        },
      }),
    ),
    prisma.shiftPlan.update({
      where: { id: planId },
      data: {
        generatedAt: new Date(),
        weights: JSON.stringify(weights ?? {}),
        lastResult: JSON.stringify({
          summary: result.summary,
          unfilled: result.unfilled,
          loads: result.loads,
          elapsedMs: result.elapsedMs,
          mode,
        }),
      },
    }),
  ]);

  return { ok: true, result, warnings: warningsFor(result) };
}

/** 実行後に人が見るべきこと。割当は止めないが、放置すると事故になる。 */
function warningsFor(result: AutoResult): string[] {
  const out: string[] = [];

  if (result.unfilled.length > 0) {
    const total = result.unfilled.reduce((s, u) => s + u.shortage, 0);
    out.push(`${total}人ぶんが埋まりませんでした（${result.unfilled.length}コマ）`);
  }
  if (result.summary.spread >= 4) {
    out.push(
      `割当コマ数の差が ${result.summary.spread} コマあります。` +
        `希望を出した量の違いによるものか、充足率で確かめてください。`,
    );
  }
  const noRequest = result.loads.filter((l) => l.available === 0);
  if (noRequest.length > 0) {
    out.push(
      `希望を1件も出していない講師がいます（${noRequest.map((l) => l.name).join("、")}）`,
    );
  }
  return out;
}

// ---------- 確定 ----------

/**
 * 確定する前に人が見るべきこと。
 *
 * **止めはしない。** 当日の欠員など、埋まらないまま確定せざるを得ない状況はある。
 * ただし件数を出して「知らずに確定した」を防ぐ（要件 FR-E4）。
 */
export type ConfirmWarning = { code: string; message: string };

export async function confirmWarnings(planId: number): Promise<ConfirmWarning[]> {
  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan) return [];

  const out: ConfirmWarning[] = [];

  const [demands, assignments, requests, events] = await Promise.all([
    prisma.shiftDemand.findMany({ where: { planId, required: { gt: 0 } } }),
    prisma.shiftAssignment.findMany({ where: { planId } }),
    prisma.shiftRequest.findMany({
      where: { date: { gte: plan.fromDate, lte: plan.toDate } },
    }),
    eventsBetween(plan.fromDate, plan.toDate),
  ]);

  // 未充足
  const filled = new Map<string, number>();
  for (const a of assignments) {
    if (a.subjectId === null) continue;
    const k = `${a.date}:${a.periodId}:${a.subjectId}`;
    filled.set(k, (filled.get(k) ?? 0) + 1);
  }
  let shortage = 0;
  for (const d of demands) {
    const k = `${d.date}:${d.periodId}:${d.subjectId}`;
    shortage += Math.max(0, d.required - (filled.get(k) ?? 0));
  }
  if (shortage > 0) {
    out.push({
      code: "UNFILLED",
      message: `${shortage}人ぶんが埋まっていません`,
    });
  }

  // 「出られない」と回答されているコマへの割当。手修正で起きうる。
  const ng = new Set(
    requests
      .filter((r) => r.status === SHIFT.NG)
      .map((r) => `${r.teacherId}:${r.date}:${r.periodId}`),
  );
  const ngCount = assignments.filter((a) =>
    ng.has(`${a.teacherId}:${a.date}:${a.periodId}`),
  ).length;
  if (ngCount > 0) {
    out.push({
      code: "NG_ASSIGNED",
      message: `「出られない」と回答されているコマに ${ngCount} 件の割当があります`,
    });
  }

  // 休校が後から決まった場合、割当が残っていることがある
  const closedCount = assignments.filter((a) => isClosed(a.date, events)).length;
  if (closedCount > 0) {
    out.push({
      code: "CLOSED_ASSIGNED",
      message: `休校日に ${closedCount} 件の割当が残っています`,
    });
  }

  return out;
}

/**
 * 確定する。ここから講師に見えるようになる。
 * 警告があっても確定はできる（止めるのではなく、知らせるだけ）。
 */
export async function confirmPlan(planId: number, actorId: number): Promise<boolean> {
  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== PLAN_STATUS.DRAFT) return false;

  await prisma.shiftPlan.update({
    where: { id: planId },
    data: {
      status: PLAN_STATUS.CONFIRMED,
      confirmedAt: new Date(),
      confirmedById: actorId,
    },
  });
  return true;
}

/**
 * 確定を解除して下書きに戻す。
 *
 * 確定したシフトを黙って変えられると、講師が見た予定と実際がずれる。
 * 理由を必須にして、誰が・いつ・なぜ戻したかを残す。
 */
export async function reopenPlan(
  planId: number,
  actorId: number,
  reason: string,
): Promise<boolean> {
  const trimmed = reason.trim();
  if (!trimmed) return false;

  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== PLAN_STATUS.CONFIRMED) return false;

  await prisma.shiftPlan.update({
    where: { id: planId },
    data: {
      status: PLAN_STATUS.DRAFT,
      reopenedAt: new Date(),
      reopenedById: actorId,
      reopenReason: trimmed.slice(0, 500),
    },
  });
  return true;
}

/** 保存した実行結果を読む。JSON文字列で持っているので、壊れていたら null。 */
export function parseLastResult(raw: string): {
  summary: AutoResult["summary"];
  unfilled: AutoResult["unfilled"];
  loads: AutoResult["loads"];
  elapsedMs: number;
  mode: GenerateMode;
} | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
