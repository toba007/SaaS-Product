import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleShiftAssignment } from "../actions";
import { loadSummary, spread } from "@/lib/shifts";
import { termKindOfDate } from "@/lib/terms";
import { eventsBetween, isClosed } from "@/lib/events";
import {
  EMPLOYMENT_LABEL,
  SHIFT,
  SHIFT_MARK,
  TERM_KIND_LABEL,
  todayISO,
} from "@/lib/constants";
import {
  WEEKDAYS,
  dayOfMonth,
  dayOfWeek,
  shiftDays,
  weekDays,
  weekStart,
  withinTerm,
} from "@/lib/dates";

export const metadata = { title: "シフト調整＆確定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const anchor =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayISO();
  const days = weekDays(anchor);
  const from = days[0];
  const to = days[6];

  const [teachers, allPeriods, terms, requests, assignments, rows] =
    await Promise.all([
      prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
      prisma.period.findMany({ orderBy: { order: "asc" } }),
      prisma.term.findMany({ orderBy: { startDate: "asc" } }),
      prisma.shiftRequest.findMany({ where: { date: { gte: from, lte: to } } }),
      prisma.shiftAssignment.findMany({ where: { date: { gte: from, lte: to } } }),
      loadSummary(from, to),
    ]);

  // 塾の予定。休校日は割当できないので、盤面でも見えるようにする。
  const events = await eventsBetween(from, to);
  // 休校が後から決まった場合、確定が残っていることがある。外す必要があるので警告する。
  const closedAssigned = assignments.filter((a) => isClosed(a.date, events)).length;

  // コマは期タイプごとに違う（レギュラーは夕方3コマ、講習は朝から6コマ）。
  // 1週間の中でレギュラーと講習が混ざることがあるので、日ごとにコマを引く。
  const periodsOf = (date: string) => {
    const kind = termKindOfDate(date, terms);
    return allPeriods.filter((p) => p.termKind === kind);
  };
  // 列数は日によって変わる
  const columns = days.flatMap((d) => periodsOf(d).map((p) => ({ date: d, period: p })));

  const reqOf = (teacherId: number, date: string, periodId: number) =>
    requests.find(
      (r) => r.teacherId === teacherId && r.date === date && r.periodId === periodId,
    );
  const isAssigned = (teacherId: number, date: string, periodId: number) =>
    assignments.some(
      (a) => a.teacherId === teacherId && a.date === date && a.periodId === periodId,
    );

  const gap = spread(rows);
  const maxAssigned = Math.max(1, ...rows.map((r) => r.assigned));
  const totalConflicts = rows.reduce((s, r) => s + r.conflicts, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">調整＆確定</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            集まった希望を見ながらコマを割り当てます。押すと確定／解除。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/shifts/board?week=${shiftDays(from, -7)}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ← 前週
          </Link>
          <Link
            href={`/shifts/board?week=${weekStart(todayISO())}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            今週
          </Link>
          <Link
            href={`/shifts/board?week=${shiftDays(from, 7)}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            翌週 →
          </Link>
        </div>
      </div>

      {totalConflicts > 0 && (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          「出られない」と回答されているコマに {totalConflicts} 件の確定が入っています。
          下の表の赤いセルを確認してください。
        </p>
      )}

      {closedAssigned > 0 && (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          休校日に確定シフトが {closedAssigned} 件残っています。赤いセルを押して外してください。
        </p>
      )}

      {/* 盤面 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-32"
              >
                講師
              </th>
              {days.map((d) => {
                const term = terms.find((t) => withinTerm(d, t));
                const dow = dayOfWeek(d);
                const count = periodsOf(d).length;
                if (count === 0) return null;
                const closed = isClosed(d, events);
                return (
                  <th
                    key={d}
                    colSpan={count}
                    className={`border-b border-l border-slate-200 px-1 py-1 text-xs font-medium ${
                      dow === 0
                        ? "text-rose-500"
                        : dow === 6
                          ? "text-sky-500"
                          : "text-slate-600"
                    } ${closed ? "bg-rose-50" : d === todayISO() ? "bg-indigo-50" : ""}`}
                  >
                    {dayOfMonth(d)}({WEEKDAYS[dow]})
                    {closed ? (
                      <span className="ml-1 text-[9px] bg-rose-500 text-white rounded px-1">
                        休
                      </span>
                    ) : (
                      term &&
                      term.kind !== "REGULAR" && (
                        <span className="ml-1 text-[9px] text-amber-700">
                          {TERM_KIND_LABEL[term.kind]}
                        </span>
                      )
                    )}
                  </th>
                );
              })}
              <th
                rowSpan={2}
                className="border-b border-l-2 border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 w-24"
              >
                今週の割当
              </th>
            </tr>
            <tr>
              {columns.map(({ date: d, period: p }) => (
                <th
                  key={`${d}-${p.id}`}
                  title={`${p.name} ${p.startTime}-${p.endTime}`}
                  className={`border-b border-slate-200 px-0 py-0.5 text-[10px] font-normal text-slate-400 w-7 ${
                    p.order === 0 ? "border-l border-slate-200" : ""
                  } ${d === todayISO() ? "bg-indigo-50" : ""}`}
                >
                  {p.order + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => {
              const row = rows.find((r) => r.teacherId === t.id);
              return (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <th className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1 text-left font-normal">
                    <div className="text-sm text-slate-900 truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {EMPLOYMENT_LABEL[t.employment]}
                    </div>
                  </th>

                  {columns.map(({ date: d, period: p }) => {
                    const r = reqOf(t.id, d, p.id);
                    const assigned = isAssigned(t.id, d, p.id);
                    const conflict = assigned && r?.status === SHIFT.NG;
                    const closed = isClosed(d, events);

                    // 休校日は割当できない。ただし確定が残っていれば外せるようにする。
                    if (closed && !assigned) {
                      return (
                        <td
                          key={`${d}-${p.id}`}
                          className={`border-b border-slate-100 p-0 text-center ${
                            p.order === 0 ? "border-l border-slate-200" : ""
                          }`}
                        >
                          <div
                            className="w-7 h-7 bg-rose-50/70"
                            title={`${d} は休校日です`}
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={`${d}-${p.id}`}
                        className={`border-b border-slate-100 p-0 text-center ${
                          p.order === 0 ? "border-l border-slate-200" : ""
                        }`}
                      >
                        <form action={toggleShiftAssignment}>
                          <input type="hidden" name="teacherId" value={t.id} />
                          <input type="hidden" name="date" value={d} />
                          <input type="hidden" name="periodId" value={p.id} />
                          <button
                            type="submit"
                            title={cellTitle(t.name, d, p.name, r?.status, assigned)}
                            className={`w-7 h-7 text-[11px] leading-none ${cellClass(
                              r?.status,
                              assigned,
                              conflict || (closed && assigned),
                            )}`}
                          >
                            {assigned ? "●" : r ? SHIFT_MARK[r.status] : ""}
                          </button>
                        </form>
                      </td>
                    );
                  })}

                  <td className="border-b border-slate-100 border-l-2 border-l-slate-300 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums text-slate-900 w-4 text-right">
                        {row?.assigned ?? 0}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{
                            width: `${((row?.assigned ?? 0) / maxAssigned) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums w-8">
                        /{row?.available ?? 0}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          <Legend cls="bg-indigo-600 text-white">●</Legend> 確定
        </span>
        <span>
          <Legend cls="bg-indigo-50 text-indigo-600">◎</Legend> 入りたい
        </span>
        <span>
          <Legend cls="bg-white text-slate-500 border border-slate-200">○</Legend>{" "}
          出られる
        </span>
        <span>
          <Legend cls="bg-rose-50 text-rose-400">×</Legend> 出られない
        </span>
        <span>
          <Legend cls="bg-slate-50 text-slate-300">　</Legend> 未回答
        </span>
        <span>
          <Legend cls="bg-rose-50 text-rose-300">　</Legend> 休校日
        </span>
        <span className="text-slate-400">
          数字は「確定コマ数 / 出られると答えたコマ数」
        </span>
      </div>

      {/* 偏りの確認 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">今週の偏り</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            希望を出した講師の中で、割当コマ数がいちばん多い人と少ない人の差は{" "}
            <span
              className={`font-bold ${gap >= 4 ? "text-rose-600" : gap >= 2 ? "text-amber-600" : "text-emerald-600"}`}
            >
              {gap}コマ
            </span>
            です。
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400">
              <th className="text-left font-medium px-4 py-1.5">講師</th>
              <th className="text-right font-medium px-2 py-1.5 w-20">出られる</th>
              <th className="text-right font-medium px-2 py-1.5 w-20">確定</th>
              <th className="text-right font-medium px-4 py-1.5 w-24">充足率</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.assigned - a.assigned)
              .map((r) => (
                <tr key={r.teacherId} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 text-slate-900">
                    {r.name}
                    {r.conflicts > 0 && (
                      <span className="ml-2 text-[10px] text-rose-700 bg-rose-50 rounded px-1">
                        NGに{r.conflicts}件
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.available}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                    {r.assigned}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-slate-500">
                    {r.fillRate === null ? "—" : `${Math.round(r.fillRate * 100)}%`}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          充足率は「出られると答えたコマのうち、実際に入ったコマの割合」。
          特定の講師だけ極端に高い／低い状態が続いていないかの目安になります。
        </p>
      </section>

      {terms.length > 0 && (
        <p className="text-[11px] text-slate-400">
          期:{" "}
          {terms
            .map((t) => `${t.name}（${TERM_KIND_LABEL[t.kind]}）${t.startDate}〜${t.endDate}`)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}

function cellClass(
  status: string | undefined,
  assigned: boolean,
  conflict: boolean,
): string {
  if (conflict) return "bg-rose-500 text-white font-bold ring-1 ring-inset ring-rose-700";
  if (assigned) return "bg-indigo-600 text-white font-bold hover:bg-indigo-700";
  if (status === SHIFT.PREFER)
    return "bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100";
  if (status === SHIFT.OK) return "bg-white text-slate-500 hover:bg-slate-100";
  if (status === SHIFT.NG) return "bg-rose-50 text-rose-400 hover:bg-rose-100";
  return "bg-slate-50 text-slate-300 hover:bg-slate-100";
}

function cellTitle(
  name: string,
  date: string,
  period: string,
  status: string | undefined,
  assigned: boolean,
): string {
  const want =
    status === SHIFT.PREFER
      ? "できれば入りたい"
      : status === SHIFT.OK
        ? "出られる"
        : status === SHIFT.NG
          ? "出られない"
          : "未回答";
  return `${name} ${date} ${period}／希望: ${want}／${assigned ? "確定済み" : "未確定"}`;
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-sm align-middle text-[10px] ${cls}`}
    >
      {children}
    </span>
  );
}
