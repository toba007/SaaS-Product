import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  buildDemandFromPlans,
  bulkSetDemand,
  clearDemand,
  confirmPlan as confirmPlanAction,
  generateShiftPlan,
  reopenPlan,
} from "../actions";
import { balanceBySubject, totalBalance } from "@/lib/demand";
import { getSetting } from "@/lib/settings";
import {
  checkPreconditions,
  confirmWarnings,
  parseLastResult,
} from "@/lib/shifts-plan";
import { WEEKDAYS, datesBetween, dayOfWeek } from "@/lib/dates";
import {
  lessonStyleLabel,
  lessonStyles,
  PLAN_STATUS,
  PLAN_STATUS_LABEL,
  TERM_KIND_LABEL,
  formatDateJP,
} from "@/lib/constants";

export const metadata = { title: "必要人数の設定｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 埋まらなかった理由。
 * 「人がいない」と「その科目を教えられる人がいない」を取り違えると、
 * 現場は不要な募集をかけてしまう。対処が変わるので必ず分けて出す。
 */
const UNFILLED_REASON: Record<string, string> = {
  NO_CANDIDATE: "このコマに出られる講師がいません",
  NO_SUBJECT_TEACHER: "出られる講師はいますが、この科目を担当できません",
  ALL_AT_LIMIT: "候補はいますが、全員が勤務上限に達しています",
  DEMAND_EXCEEDS_SUPPLY: "担当できる講師の数が必要人数に足りません",
  LOCKED_BLOCKED: "固定した割当が枠を占めています",
};

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isInteger(planId)) notFound();

  const plan = await prisma.shiftPlan.findUnique({ where: { id: planId } });
  if (!plan) notFound();

  const [periods, subjects, demands, requests, links, setting] = await Promise.all([
    prisma.period.findMany({
      orderBy: [{ termKind: "asc" }, { gradeBand: "asc" }, { order: "asc" }],
    }),
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.shiftDemand.findMany({ where: { planId } }),
    prisma.shiftRequest.findMany({
      where: { date: { gte: plan.fromDate, lte: plan.toDate } },
    }),
    prisma.teacherSubject.findMany(),
    getSetting(),
  ]);

  const balance = balanceBySubject(subjects, demands, requests, links);
  const total = totalBalance(demands, requests);
  const editable = plan.status === PLAN_STATUS.DRAFT;

  const blocked = await checkPreconditions(planId);
  const last = parseLastResult(plan.lastResult);
  // 確定を止めはしないが、「知らずに確定した」を防ぐために件数を出す
  const confirmIssues = editable ? await confirmWarnings(planId) : [];

  // 入力したとおりの形（曜日 × コマ × 科目 × 形態）にまとめ直して見せる。
  // 日別に並べると1か月で数百行になり、何を入れたのか分からなくなる。
  const grouped = new Map<
    string,
    { dow: number; periodId: number; subjectId: number; format: string; required: number; days: number }
  >();
  for (const d of demands) {
    const dow = dayOfWeek(d.date);
    const key = `${dow}:${d.periodId}:${d.subjectId}:${d.format}`;
    const cur = grouped.get(key);
    if (cur) {
      cur.days++;
      // 日別に上書きされていれば人数が揃わない。多いほうを代表値にする。
      cur.required = Math.max(cur.required, d.required);
    } else {
      grouped.set(key, {
        dow,
        periodId: d.periodId,
        subjectId: d.subjectId,
        format: d.format,
        required: d.required,
        days: 1,
      });
    }
  }
  const rows = [...grouped.values()].sort(
    (a, b) =>
      a.dow - b.dow ||
      a.periodId - b.periodId ||
      a.subjectId - b.subjectId ||
      a.format.localeCompare(b.format),
  );

  const periodName = (pid: number) => {
    const p = periods.find((x) => x.id === pid);
    if (!p) return `コマ${pid}`;
    const kind = p.termKind === "REGULAR" ? "" : `${TERM_KIND_LABEL[p.termKind]} `;
    return `${kind}${p.name}`;
  };
  const subjectName = (sid: number) =>
    subjects.find((s) => s.id === sid)?.name ?? `科目${sid}`;

  const openDays = datesBetween(plan.fromDate, plan.toDate).length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/shifts/plans" className="text-sm text-indigo-600 hover:underline">
          ← シフト計画
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-xl font-bold text-slate-900">{plan.name}</h1>
          <span
            className={`text-[11px] rounded px-1.5 py-0.5 ${
              plan.status === PLAN_STATUS.CONFIRMED
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          {formatDateJP(plan.fromDate)} 〜 {formatDateJP(plan.toDate)}（{openDays}日間）
        </p>
      </div>

      {/* 確定。ここを境に講師へ見えるようになる。 */}
      <section
        className={`border rounded-lg ${
          plan.status === PLAN_STATUS.CONFIRMED
            ? "bg-emerald-50/50 border-emerald-200"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="px-4 py-3">
          {plan.status === PLAN_STATUS.CONFIRMED ? (
            <>
              <p className="text-sm text-emerald-800">
                <b>確定済みです。</b>
                講師の画面に自分の出勤予定が出ています。
                {plan.confirmedAt && (
                  <span className="text-emerald-700 text-xs ml-1">
                    （{new Date(plan.confirmedAt).toLocaleString("ja-JP")}）
                  </span>
                )}
              </p>
              <form action={reopenPlan} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="planId" value={plan.id} />
                <label className="text-xs text-slate-500">
                  確定を解除する理由（必須）
                  <input
                    name="reason"
                    required
                    placeholder="例: 高橋先生の急な予定変更のため"
                    className="block mt-0.5 w-72 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
                  />
                </label>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded text-slate-600 hover:bg-white"
                >
                  確定を解除する
                </button>
                <span className="text-[11px] text-slate-400">
                  解除すると講師の画面から消えます
                </span>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                <b className="text-slate-900">まだ下書きです。</b>
                この内容は講師に見えていません。確定すると講師の画面に出ます。
              </p>

              {confirmIssues.length > 0 && (
                <div className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <p className="font-medium">このまま確定すると、次の状態のまま公開されます。</p>
                  <ul className="mt-1 space-y-0.5">
                    {confirmIssues.map((w) => (
                      <li key={w.code}>・{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form action={confirmPlanAction} className="mt-2">
                <input type="hidden" name="planId" value={plan.id} />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
                >
                  確定して講師に公開する
                </button>
              </form>
            </>
          )}

          {plan.reopenedAt && (
            <p className="mt-2 text-[11px] text-slate-400">
              {new Date(plan.reopenedAt).toLocaleString("ja-JP")} に確定を解除：
              {plan.reopenReason}
            </p>
          )}
        </div>
      </section>

      {/* 自動作成。ここがこの機能の中心。 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">自動作成</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            希望と必要人数から出勤シフトを組みます。同じ条件なら何度実行しても同じ結果になります。
          </p>
        </div>

        {blocked.length > 0 ? (
          <div className="px-4 py-3">
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              まだ実行できません。次を先に済ませてください。
            </p>
            <ul className="mt-2 space-y-1">
              {blocked.map((b, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-[10px] text-slate-400 mt-1">{b.code}</span>
                  <span>{b.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-4 py-3 flex flex-wrap items-center gap-2">
            <form action={generateShiftPlan}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="mode" value="FULL" />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                自動作成する（作り直し）
              </button>
            </form>
            <form action={generateShiftPlan}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="mode" value="FILL" />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm border border-slate-200 rounded hover:bg-slate-50"
              >
                足りないところだけ埋める
              </button>
            </form>
            <span className="text-[11px] text-slate-400">
              固定した割当は、作り直しても動きません
            </span>
          </div>
        )}

        {last && (
          <div className="border-t border-slate-100">
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-3 text-sm">
                <span className="tabular-nums font-bold text-slate-900">
                  {last.summary.placedTotal} / {last.summary.requiredTotal} 人ぶん
                </span>
                <span
                  className={`tabular-nums ${
                    last.summary.fillRate >= 1 ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  充足率 {(last.summary.fillRate * 100).toFixed(0)}%
                </span>
                <span className="text-slate-500 text-xs">
                  偏り {last.summary.spread}コマ
                </span>
                <span className="text-slate-400 text-xs">
                  {last.elapsedMs}ms・{last.mode === "FULL" ? "作り直し" : "追加のみ"}
                </span>
                {plan.generatedAt && (
                  <span className="text-slate-400 text-xs">
                    {new Date(plan.generatedAt).toLocaleString("ja-JP")}
                  </span>
                )}
              </div>
            </div>

            {last.unfilled.length > 0 && (
              <div className="px-4 pb-3">
                <h3 className="text-xs font-medium text-slate-500 mb-1">
                  埋まらなかったコマ
                </h3>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {last.unfilled.slice(0, 20).map((u, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-2 py-1 text-slate-600 w-24">
                            {formatDateJP(u.date)}
                          </td>
                          <td className="px-2 py-1 text-slate-600 w-24">
                            {periodName(u.periodId)}
                          </td>
                          <td className="px-2 py-1 text-slate-900 w-20">
                            {subjectName(u.subjectId)}
                          </td>
                          <td className="px-2 py-1 text-rose-600 tabular-nums w-16">
                            {u.shortage}人不足
                          </td>
                          <td className="px-2 py-1 text-slate-500">
                            {UNFILLED_REASON[u.reason] ?? u.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {last.unfilled.length > 20 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    ほか {last.unfilled.length - 20} 件
                  </p>
                )}
              </div>
            )}

            <div className="px-4 pb-3">
              <h3 className="text-xs font-medium text-slate-500 mb-1">講師ごとの割当</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-400">
                    <th className="text-left font-medium py-1">講師</th>
                    <th className="text-right font-medium py-1 w-20">出られる</th>
                    <th className="text-right font-medium py-1 w-16">割当</th>
                    <th className="text-right font-medium py-1 w-20">充足率</th>
                  </tr>
                </thead>
                <tbody>
                  {[...last.loads]
                    .sort((a, b) => b.assigned - a.assigned)
                    .map((l) => (
                      <tr key={l.teacherId} className="border-t border-slate-100">
                        <td className="py-1 text-slate-900">{l.name}</td>
                        <td className="py-1 text-right tabular-nums text-slate-500">
                          {l.available}
                        </td>
                        <td className="py-1 text-right tabular-nums font-medium text-slate-900">
                          {l.assigned}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-500">
                          {l.fillRate === null ? "—" : `${Math.round(l.fillRate * 100)}%`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-1">
                割当コマ数の差だけを見ると「そもそも希望を多く出した講師が多く入って当然」なので、
                <b>充足率が揃っているか</b>で公平さを見てください。
              </p>
            </div>

            <div className="px-4 py-2 border-t border-slate-100">
              <Link
                href="/shifts/board"
                className="text-sm text-indigo-600 hover:underline"
              >
                盤面で確認・手直しする →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* 実行する前に人が足りるかを示す。回してから「埋まりません」では遅い。 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">必要人数と、集まっている希望</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            自動作成を回す前に、そもそも人手が足りるかを確認できます。
          </p>
        </div>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="text-slate-500 text-xs">期間全体</span>
            <span className="tabular-nums font-bold text-slate-900">
              必要 {total.required} コマ
            </span>
            <span className="text-slate-300">/</span>
            <span className="tabular-nums text-slate-600">
              出られると回答 {total.available} コマ
            </span>
          </div>
          {total.short && (
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-2">
              必要な延べコマ数が、集まっている希望を超えています。
              このままだと確実に埋まりません。募集するか、必要人数を見直してください。
            </p>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400">
              <th className="text-left font-medium px-4 py-1.5">科目</th>
              <th className="text-right font-medium px-2 py-1.5 w-24">必要</th>
              <th className="text-right font-medium px-2 py-1.5 w-32">出られる（上限）</th>
              <th className="text-left font-medium px-4 py-1.5">状況</th>
            </tr>
          </thead>
          <tbody>
            {balance.map((b) => (
              <tr key={b.subjectId} className="border-t border-slate-100">
                <td className="px-4 py-1.5 text-slate-900">{b.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                  {b.required}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                  {b.required === 0 ? "—" : b.supplyUpperBound}
                </td>
                <td className="px-4 py-1.5 text-xs">
                  {b.noTeacher ? (
                    <span className="text-rose-700">
                      この科目を担当できる講師がいません（自動作成できません）
                    </span>
                  ) : b.short ? (
                    <span className="text-rose-700">確実に足りません</span>
                  ) : b.required === 0 ? (
                    <span className="text-slate-300">未設定</span>
                  ) : (
                    <span className="text-slate-400">足りている可能性あり</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          「出られる（上限）」は、その科目を担当できる講師が出られると答えた延べコマ数です。
          <b>1人の講師が同じコマで担当できる科目は1つだけ</b>なので、
          英語も数学も教えられる講師は両方に数えられています。
          <b>この数を超えていたら確実に足りない</b>という見方をしてください
          （下回っていても足りるとは限りません）。
        </p>
      </section>

      {/*
        受講予定から必要人数を作る。
        クラスが立っていて個別の配置が入っていれば、必要人数は数えれば出る。
        手で入れるのは、計算で出せない事情（特別対応など）だけでよい。
      */}
      {editable && (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">
              受講予定から作る
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              クラス編成と個別の受講予定を数えて、必要人数を入れます。
            </p>
          </div>
          <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            <form action={buildDemandFromPlans}>
              <input type="hidden" name="planId" value={plan.id} />
              <button
                type="submit"
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                受講予定から必要人数を作る
              </button>
            </form>
            <p className="text-[11px] text-slate-500 flex-1 min-w-60">
              <b className="text-slate-700">計算で出た枠だけを書き換えます。</b>
              手で入れた行は残るので、特別対応はそのままにできます。
              作り直したいときは、下の「すべて消す」を先に押してください。
            </p>
          </div>
          <p className="px-4 pb-3 text-[11px] text-slate-400">
            もとになるのは{" "}
            <Link href="/classes" className="text-indigo-600 hover:underline">
              クラス編成
            </Link>{" "}
            と{" "}
            <Link href="/students/schedule" className="text-indigo-600 hover:underline">
              個別の受講予定
            </Link>{" "}
            です。配置が足りない生徒は数えられないので、先にそちらで確認してください。
          </p>
        </section>
      )}

      {/* 曜日でまとめて入れる。1日ずつでは 30日×5コマ×5科目 で750マスになる。 */}
      {editable ? (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">手で入れる</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              曜日を指定して、期間内のその曜日すべてに入ります。休校日は飛ばします。
            </p>
          </div>
          <form
            action={bulkSetDemand}
            className="px-4 py-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="planId" value={plan.id} />
            <label className="text-xs text-slate-500">
              曜日
              <select
                name="dayOfWeek"
                className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              コマ
              <select
                name="periodId"
                className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {periodName(p.id)} {p.startTime}-{p.endTime}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              科目
              <select
                name="subjectId"
                className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              形態
              <select
                name="format"
                className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
              >
                {lessonStyles(setting.indivMaxStudents).map((s: string) => (
                  <option key={s} value={s}>
                    {lessonStyleLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              必要人数
              <input
                type="number"
                name="required"
                min={0}
                max={99}
                defaultValue={1}
                className="block mt-0.5 w-20 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
              />
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              まとめて入れる
            </button>
            <span className="text-[11px] text-slate-400">
              0 を入れると、その曜日のぶんを消します
            </span>
          </form>
        </section>
      ) : (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          確定済みの計画は必要人数を変更できません。変更するには確定を解除してください。
        </p>
      )}

      {/* 入れたとおりの形で見せる */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">
            設定済みの必要人数
            <span className="ml-2 text-xs font-normal text-slate-400">
              {demands.length}件
            </span>
          </h2>
          {editable && demands.length > 0 && (
            <form action={clearDemand}>
              <input type="hidden" name="planId" value={plan.id} />
              <button
                type="submit"
                className="text-xs text-slate-400 hover:text-rose-600"
              >
                すべて消す
              </button>
            </form>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">
            まだ設定されていません。上のフォームから入れてください。
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400">
                <th className="text-left font-medium px-4 py-1.5 w-16">曜日</th>
                <th className="text-left font-medium px-2 py-1.5">コマ</th>
                <th className="text-left font-medium px-2 py-1.5">科目</th>
                <th className="text-left font-medium px-2 py-1.5">形態</th>
                <th className="text-right font-medium px-2 py-1.5 w-20">人数</th>
                <th className="text-right font-medium px-4 py-1.5 w-20">日数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 text-slate-900">{WEEKDAYS[r.dow]}</td>
                  <td className="px-2 py-1.5 text-slate-600">{periodName(r.periodId)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{subjectName(r.subjectId)}</td>
                  <td className="px-2 py-1.5 text-slate-500 text-xs">
                    {lessonStyleLabel(r.format)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                    {r.required}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-slate-400">
                    {r.days}日
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
