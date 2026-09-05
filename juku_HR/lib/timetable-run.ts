/**
 * 開講時間割を「組んで、記録して、確定する」ところ。
 *
 * ---- 実行を記録として残す理由 ----
 * ローカルの LLM に頼むと実測で18分かかる。ボタンを押して待たせると
 * ブラウザが固まるので、**始めたら記録を作ってすぐ戻り、結果は後から見る**。
 * 画面は記録を読むだけなので、途中でページを閉じても実行は続く。
 *
 * ---- 提案と確定を分ける ----
 * ここが作るのは案（TimetableRun）。人が見て手直しして、確定を押したときに
 * 初めて ClassSession（集団）と StudentSchedule（個別）へ書き込む。
 * 自動で出したものがそのまま生徒の予定になることは無い。
 */

import { prisma } from "./prisma";
import { getSetting } from "./settings";
import { excludeClosed } from "./events";
import { datesBetween } from "./dates";
import { LESSON_STYLE, TERM_KIND, bandOfGrade, indivSizeOf } from "./constants";
import { periodsForGrade } from "./periods";
import { pseudonym } from "./ai/anonymize";
import { OllamaClient, checkOllama } from "./ai/local-ollama";
import { LlmError } from "./ai/client";
import {
  proposeTimetable,
  proposeWithoutLlm,
  type ProposeResult,
} from "./ai/propose-timetable";
import { packGroups } from "./indiv-groups";
import {
  buildAvailability,
  foldWeekly,
  reliableTeachers,
  slotKey,
  type Availability,
  type CheckInput,
  type Target,
} from "./timetable";

export const RUN_STATUS = {
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;

export const RUN_MODE = {
  /** LLM に提案させて、検証して、足りないぶんを機械で埋める */
  AI: "AI",
  /** LLM を使わず、機械だけで組む */
  GREEDY: "GREEDY",
} as const;

/** 開講する曜日。日曜は休みとして外す。 */
const OPEN_DAYS = [1, 2, 3, 4, 5, 6];

/**
 * LLM に一度に頼む対象の数。
 *
 * 20件をまとめて頼むと出力が崩れて空応答になる（実測）。
 * 4件ずつに分けると通るようになった。
 */
const CHUNK_SIZE = 4;

/** ローカル実行は長い。まとめて流す処理なので待つ。 */
const LLM_TIMEOUT_MS = 900_000;

// ---------- 入力を組み立てる ----------

export type BuildResult = {
  input: CheckInput;
  /** 置ける枠がまったく無い対象。先に知らせる */
  nowhere: Target[];
};

/**
 * DB から、その期の時間割を組むのに要るものを集める。
 *
 * 集団はクラス、個別は生徒×科目。**置き場所を決める**という点では同じ問題なので
 * 1つの形（Target）に揃えてから解く。
 */
export async function buildTimetableInput(termId: number): Promise<BuildResult> {
  const term = await prisma.term.findUniqueOrThrow({ where: { id: termId } });

  const [periods, classGroups, enrollments, links, requests, teacherSubjects, setting] =
    await Promise.all([
      prisma.period.findMany({
        where: { termKind: TERM_KIND.REGULAR },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
      }),
      prisma.classGroup.findMany(),
      prisma.classEnrollment.findMany(),
      prisma.studentSubject.findMany({
        where: { active: true },
        include: { student: { select: { id: true, grade: true } } },
      }),
      prisma.shiftRequest.findMany({
        where: { date: { gte: term.startDate, lte: term.endDate } },
      }),
      prisma.teacherSubject.findMany(),
      getSetting(),
    ]);

  // 休校日は除く。分母に入れると「毎回出られる」判定がずれる。
  const days = await excludeClosed(datesBetween(term.startDate, term.endDate));

  const targets: Target[] = [];

  for (const c of classGroups) {
    // その期に重ならないクラス（前の学期のもの）は対象にしない
    if (c.toDate < term.startDate || c.fromDate > term.endDate) continue;

    // **週コマ数はクラスに宣言されている数を使う。**
    // 既存の時間割（ClassSession）から数えると、まだ組んでいない状態で
    // 0 になり、「週1コマ」と決め打つしかなくなる。中3Ⅰ数学が週3コマでも
    // 1コマしか置かれない、という事故になる。
    //
    // 0 は「その期は開講しない」。個別（StudentSubject）と同じ扱いで対象から外す。
    const slots = c.slotsPerWeek;
    if (slots <= 0) continue;
    targets.push({
      key: `class:${c.id}`,
      kind: "CLASS",
      refId: c.id,
      label: c.name,
      subjectId: c.subjectId,
      gradeBand: bandOfGrade(c.grade),
      studentIds: enrollments.filter((e) => e.classGroupId === c.id).map((e) => e.studentId),
      slots,
    });
  }

  for (const l of links) {
    if (l.format === LESSON_STYLE.GROUP) continue;
    // 週コマ数が 0 のままなら、まだ聞けていないということ。置きようが無い。
    if (l.slotsPerWeek <= 0) continue;
    targets.push({
      key: `indiv:${l.id}`,
      kind: "INDIV",
      refId: l.id,
      // LLM にも画面にも仮名で出す。実名は外に出さない。
      label: `${pseudonym(l.studentId)}／科目${l.subjectId}`,
      subjectId: l.subjectId,
      gradeBand: bandOfGrade(l.student.grade),
      studentIds: [l.studentId],
      slots: l.slotsPerWeek,
      solo: indivSizeOf(l.format) === 1,
    });
  }

  const weekly = foldWeekly(
    requests.map((r) => ({
      teacherId: r.teacherId,
      date: r.date,
      periodId: r.periodId,
      status: r.status,
    })),
    days,
    periods.map((p) => p.id),
  );

  const canTeach = (teacherId: number, subjectId: number) =>
    teacherSubjects.some((x) => x.teacherId === teacherId && x.subjectId === subjectId);

  const availability = new Map<string, Availability>();
  for (const t of targets) {
    // その学年帯が使えるコマだけを候補にする
    const sample =
      t.gradeBand === "ELEM" ? "小5" : t.gradeBand === "HIGH" ? "高1" : "中1";
    const usable = periodsForGrade(periods, sample, TERM_KIND.REGULAR);
    const slots = OPEN_DAYS.flatMap((d) => usable.map((p) => ({ dayOfWeek: d, periodId: p.id })));
    availability.set(t.key, buildAvailability(weekly, slots, t.subjectId, canTeach));
  }

  // 枠ごとに「科目を問わず出られる講師」。1人は同時に1か所にしかいられないので、
  // 科目ごとの必要人数を足し上げた数がこれを超えていないかを見るために渡す。
  const slotTeachers = new Map<string, Set<number>>();
  for (const d of OPEN_DAYS) {
    for (const p of periods) {
      const slot = { dayOfWeek: d, periodId: p.id };
      slotTeachers.set(slotKey(slot), reliableTeachers(weekly, slot));
    }
  }

  const input: CheckInput = {
    targets,
    periods,
    availability,
    slotTeachers,
    maxGroupRooms: setting.maxGroupRooms,
    maxIndivRooms: setting.maxIndivRooms,
    indivMaxStudents: setting.indivMaxStudents,
  };

  const nowhere = targets.filter(
    (t) => ![...(availability.get(t.key)?.values() ?? [])].some((s) => s.size > 0),
  );

  return { input, nowhere };
}

// ---------- 実行する ----------

/**
 * 記録を作って、**待たずに** id を返す。
 *
 * 実行そのものは戻ったあとも続く。18分待たせないための作り。
 * 途中でページを閉じても、結果は記録に残る。
 */
export async function startTimetableRun(opts: {
  termId: number;
  mode: string;
  note: string;
}): Promise<number> {
  const run = await prisma.timetableRun.create({
    data: {
      termId: opts.termId,
      mode: opts.mode === RUN_MODE.AI ? RUN_MODE.AI : RUN_MODE.GREEDY,
      note: opts.note.slice(0, 2000),
      status: RUN_STATUS.RUNNING,
    },
    select: { id: true },
  });

  // あえて await しない。呼んだ側はすぐ戻る。
  void executeRun(run.id).catch(async (e) => {
    await prisma.timetableRun
      .update({
        where: { id: run.id },
        data: {
          status: RUN_STATUS.FAILED,
          error: e instanceof Error ? e.message : String(e),
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
  });

  return run.id;
}

async function executeRun(runId: number): Promise<void> {
  const run = await prisma.timetableRun.findUniqueOrThrow({ where: { id: runId } });
  const { input } = await buildTimetableInput(run.termId);

  if (input.targets.length === 0) {
    await prisma.timetableRun.update({
      where: { id: runId },
      data: {
        status: RUN_STATUS.FAILED,
        error:
          "組む対象がありません。クラス編成か個別の受講予定を先に登録してください。",
        finishedAt: new Date(),
      },
    });
    return;
  }

  let result: ProposeResult;

  if (run.mode === RUN_MODE.AI) {
    const health = await checkOllama();
    if (!health.ok) {
      // AI が使えなくても時間割は出す。業務を止めない。
      result = proposeWithoutLlm({ check: input });
      await noteFallback(runId, `AI を使えませんでした（${health.message}）`);
    } else {
      try {
        result = await proposeTimetable(
          new OllamaClient(undefined, undefined, LLM_TIMEOUT_MS),
          { check: input, note: run.note, pseudonym, chunkSize: CHUNK_SIZE },
        );
      } catch (e) {
        result = proposeWithoutLlm({ check: input });
        await noteFallback(
          runId,
          `AI の提案に失敗しました（${e instanceof LlmError ? e.message : String(e)}）`,
        );
      }
    }
  } else {
    result = proposeWithoutLlm({ check: input });
  }

  const targetByKey = new Map(input.targets.map((t) => [t.key, t]));

  // ---- 個別の組を決める ----
  //
  // 「誰と誰を同じ講師が見るか」。**枠ごとに、上限まで詰める。**
  // 科目は見ない（1人の講師が違う科目の生徒を巡回して見るため）。
  // 1対1で取っている生徒だけは1人で1組を占める。
  //
  // ここで決めておかないと、画面が開くたびに束ね直されて
  // 「決めた」ことにならない。人が組み替えたら、その値が次まで残る。
  const setting = await getSetting();
  const groupOf = new Map<string, number>();
  const bySlot = new Map<string, typeof result.placements>();
  for (const p of result.placements) {
    const t = targetByKey.get(p.targetKey);
    if (!t || t.kind !== "INDIV") continue;
    const k = slotKey(p);
    bySlot.set(k, [...(bySlot.get(k) ?? []), p]);
  }
  for (const [k, list] of bySlot) {
    // **その顔ぶれを1人で持てる講師がいるか。**
    // 講師が担当するのは得意な2科目ほどなので、英・数・理の組を作っても
    // 3つ全部を持てる人がいなければ埋まらない。availability は
    // 「その枠に出られて、その科目を担当できる講師」なので、
    // 顔ぶれ全員のぶんを掛け合わせて、1人でも残れば持てる。
    const coverable = (members: { studentSubjectId: number }[]) => {
      let common: Set<number> | null = null;
      for (const m of members) {
        const set = input.availability.get(`indiv:${m.studentSubjectId}`)?.get(k);
        if (!set || set.size === 0) return false;
        if (common === null) {
          common = new Set<number>(set);
        } else {
          const next = new Set<number>();
          for (const id of common) if (set.has(id)) next.add(id);
          common = next;
        }
        if (common.size === 0) return false;
      }
      return common !== null && common.size > 0;
    };

    const noOf = packGroups(
      list.map((p) => {
        const t = targetByKey.get(p.targetKey)!;
        return {
          studentSubjectId: t.refId,
          subjectId: t.subjectId,
          solo: t.solo === true,
          groupNo: 0,
        };
      }),
      setting.indivMaxStudents,
      coverable,
    );
    for (const p of list) {
      const t = targetByKey.get(p.targetKey)!;
      groupOf.set(`${p.targetKey}:${k}`, noOf.get(t.refId) ?? 0);
    }
  }

  await prisma.$transaction([
    prisma.timetablePlacement.deleteMany({ where: { runId } }),
    prisma.timetablePlacement.createMany({
      data: result.placements.flatMap((p) => {
        const t = targetByKey.get(p.targetKey);
        if (!t) return [];
        return [
          {
            runId,
            targetKey: p.targetKey,
            kind: t.kind,
            refId: t.refId,
            label: t.label,
            dayOfWeek: p.dayOfWeek,
            periodId: p.periodId,
            groupNo: groupOf.get(`${p.targetKey}:${slotKey(p)}`) ?? 0,
            reason: result.reasons.get(`${p.targetKey}:${slotKey(p)}`) ?? "",
          },
        ];
      }),
    }),
    prisma.timetableRun.update({
      where: { id: runId },
      data: {
        status: RUN_STATUS.DONE,
        model: result.model,
        elapsedMs: result.elapsedMs,
        fromAi: result.fromAi,
        fromFallback: result.fromFallback,
        rejected: result.rejected.length,
        // どこまで AI に任せたかを、あとから比べられるように実測を残す
        llmCalls: result.usage.calls,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        promptMs: result.usage.promptMs,
        outputMs: result.usage.outputMs,
        targetCount: result.targetCount,
        unplaced: JSON.stringify(result.unplaced),
        finishedAt: new Date(),
      },
    }),
  ]);
}

/** AI が使えなかったことを記録に残す。黙って機械の配置に差し替えない。 */
async function noteFallback(runId: number, message: string): Promise<void> {
  await prisma.timetableRun.update({
    where: { id: runId },
    data: { error: message },
  });
}

// ---------- 確定して反映する ----------

/**
 * 案を実際の時間割にする。
 *
 * 集団は ClassSession、個別は StudentSchedule へ書き込む。
 * **その期のぶんを入れ替える**（前の内容は消す）。部分的に足すと、
 * 前回の案と混ざって「どれが今の時間割か」が分からなくなる。
 */
export async function applyTimetableRun(runId: number): Promise<{ ok: boolean; message: string }> {
  const run = await prisma.timetableRun.findUnique({
    where: { id: runId },
    include: { term: true, placements: true },
  });
  if (!run) return { ok: false, message: "実行の記録が見つかりません" };
  if (run.status !== RUN_STATUS.DONE) {
    return { ok: false, message: "まだ終わっていません" };
  }
  if (run.placements.length === 0) {
    return { ok: false, message: "配置が1件もありません" };
  }

  const classIds = [
    ...new Set(run.placements.filter((p) => p.kind === "CLASS").map((p) => p.refId)),
  ];
  const linkIds = [
    ...new Set(run.placements.filter((p) => p.kind === "INDIV").map((p) => p.refId)),
  ];

  await prisma.$transaction([
    // 集団：このクラスの時間割を入れ替える
    prisma.classSession.deleteMany({ where: { classGroupId: { in: classIds } } }),
    prisma.classSession.createMany({
      data: run.placements
        .filter((p) => p.kind === "CLASS")
        .map((p) => ({
          classGroupId: p.refId,
          dayOfWeek: p.dayOfWeek,
          periodId: p.periodId,
        })),
    }),
    // 個別：この期のぶんを入れ替える。他の期の配置は残す。
    prisma.studentSchedule.deleteMany({
      where: {
        studentSubjectId: { in: linkIds },
        fromDate: run.term.startDate,
        toDate: run.term.endDate,
      },
    }),
    prisma.studentSchedule.createMany({
      data: run.placements
        .filter((p) => p.kind === "INDIV")
        .map((p) => ({
          studentSubjectId: p.refId,
          dayOfWeek: p.dayOfWeek,
          periodId: p.periodId,
          // 誰と一緒に見るか。**人が組み替えた結果もここで一緒に確定する。**
          // 保存しないと、次に開いたときに機械が束ね直してしまう。
          groupNo: p.groupNo,
          fromDate: run.term.startDate,
          toDate: run.term.endDate,
        })),
    }),
    prisma.timetableRun.update({
      where: { id: runId },
      data: { appliedAt: new Date() },
    }),
  ]);

  return {
    ok: true,
    message: `${run.placements.length}件を時間割に反映しました`,
  };
}
