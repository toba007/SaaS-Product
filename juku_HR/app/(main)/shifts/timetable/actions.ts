"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { TERM_KIND } from "@/lib/constants";
import {
  RUN_MODE,
  RUN_STATUS,
  applyTimetableRun,
  startTimetableRun,
} from "@/lib/timetable-run";

const PATH = "/shifts/timetable";

/**
 * 時間割を組み始める。
 *
 * **待たない。** ローカルの AI に頼むと18分かかるので、記録を作ったら
 * すぐ結果ページへ送る。進み具合はそのページが自動で見に行く。
 */
export async function startRun(formData: FormData) {
  await requireAdmin();

  const termId = Number(formData.get("termId"));
  const mode = String(formData.get("mode") ?? RUN_MODE.GREEDY);
  const note = String(formData.get("note") ?? "");

  const term = await prisma.term.findUnique({
    where: { id: termId },
    select: { id: true, kind: true },
  });
  if (!term || term.kind !== TERM_KIND.REGULAR) return;

  // 同じ期で走っているものがあれば、二重に始めない。
  // 18分かかる処理を並べると、どちらの結果か分からなくなる。
  const running = await prisma.timetableRun.findFirst({
    where: { termId, status: RUN_STATUS.RUNNING },
    select: { id: true },
  });
  if (running) redirect(`${PATH}?run=${running.id}`);

  const id = await startTimetableRun({ termId, mode, note });
  revalidatePath(PATH);
  redirect(`${PATH}?run=${id}`);
}

/** 提案を実際の時間割に反映する。ここで初めて生徒の予定が変わる。 */
export async function applyRun(formData: FormData) {
  await requireAdmin();

  const runId = Number(formData.get("runId"));
  await applyTimetableRun(runId);

  revalidatePath(PATH);
  revalidatePath("/classes");
  revalidatePath("/students/schedule");
  revalidatePath("/shifts/plans");
}

/** 提案から1コマ外す。確定前なので消してよい。 */
export async function removePlacement(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const p = await prisma.timetablePlacement.findUnique({
    where: { id },
    select: { runId: true, run: { select: { appliedAt: true } } },
  });
  if (!p) return;
  // 反映済みの案を後から書き換えると、記録と実際がずれる
  if (p.run.appliedAt) return;

  await prisma.timetablePlacement.delete({ where: { id } });
  revalidatePath(PATH);
}

/**
 * 組を移す。**「この2人は同じ講師で」「この子は分けたい」を残すための操作。**
 *
 * ---- なぜ番号を直接いじらせるのか ----
 * 組は「1人の講師が同時に見る生徒の集合」で、現物の時間割では表の1列にあたる。
 * 番号を書き換えるのは、その列から別の列へ生徒を移すのと同じこと。
 *
 * ---- ここでは上限を止めない ----
 * 詰めすぎ・1対1の同居は**画面の検証で出して、確定を止める**。
 * 移す途中で弾くと、2人を入れ替えるだけでも順番によっては操作できなくなる。
 */
export async function movePlacementGroup(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const groupNo = Number(formData.get("groupNo"));
  if (!Number.isInteger(groupNo) || groupNo < 1 || groupNo > 99) return;

  const p = await prisma.timetablePlacement.findUnique({
    where: { id },
    select: { kind: true, run: { select: { appliedAt: true } } },
  });
  if (!p) return;
  // 組は個別だけの概念。集団は1クラス＝1講師なので束ねない。
  if (p.kind !== "INDIV") return;
  // 反映済みの案を後から書き換えると、記録と実際がずれる
  if (p.run.appliedAt) return;

  await prisma.timetablePlacement.update({ where: { id }, data: { groupNo } });
  revalidatePath(PATH);
}

/** 提案に1コマ足す。人が決めた枠は印を付けて、AI の提案と区別する。 */
export async function addPlacement(formData: FormData) {
  await requireAdmin();

  const runId = Number(formData.get("runId"));
  const targetKey = String(formData.get("targetKey") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const periodId = Number(formData.get("periodId"));

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;

  const [run, period, sample] = await Promise.all([
    prisma.timetableRun.findUnique({
      where: { id: runId },
      select: { id: true, appliedAt: true },
    }),
    prisma.period.findUnique({ where: { id: periodId }, select: { id: true } }),
    // 同じ対象の既存行から、名前と種別を写す
    prisma.timetablePlacement.findFirst({ where: { runId, targetKey } }),
  ]);
  if (!run || run.appliedAt || !period || !sample) return;

  // 同じ対象を同じ枠に2回置かない
  const dup = await prisma.timetablePlacement.findFirst({
    where: { runId, targetKey, dayOfWeek, periodId },
    select: { id: true },
  });
  if (dup) return;

  await prisma.timetablePlacement.create({
    data: {
      runId,
      targetKey,
      kind: sample.kind,
      refId: sample.refId,
      label: sample.label,
      dayOfWeek,
      periodId,
      byHand: true,
    },
  });
  revalidatePath(PATH);
}
