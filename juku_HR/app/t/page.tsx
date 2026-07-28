import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { bulkSetMyShifts, submitMyShift } from "./actions";
import { TermKindTabs } from "@/app/components/TermKindTabs";
import {
  parseTermKind,
  termKindOfDate,
  termKindTabs,
} from "@/lib/terms";
import { eventsBetween, eventsOn, isClosed } from "@/lib/events";
import {
  SHIFT,
  SHIFT_LABEL,
  SHIFT_MARK,
  TERM_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import {
  WEEKDAYS,
  addMonths,
  dayOfMonth,
  dayOfWeek,
  formatYm,
  monthDays,
  monthGrid,
  parseYm,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

const MARK_CLASS: Record<string, string> = {
  OK: "text-slate-600",
  PREFER: "text-indigo-600 font-bold",
  NG: "text-rose-400",
};

export default async function MyShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; ym?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const teacher = await requireAuth("/t");

  const kind = parseTermKind(sp.kind);
  const [tabs, terms] = await Promise.all([
    termKindTabs(),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  // このコマタイプのコマ。レギュラーは夕方3コマ、講習は朝から6コマ、というように違う。
  const periods = await prisma.period.findMany({
    where: { termKind: kind },
    orderBy: { order: "asc" },
  });

  // タブを切り替えたら、その期の最初の月に飛ぶ。
  // 「夏期講習」を押したのに今月（レギュラー期間）が出ると、入れる日が1つも無くて戸惑うため。
  const kindTerms = terms.filter((t) => t.kind === kind);
  const defaultYm =
    kindTerms.length > 0 ? parseYm(kindTerms[0].startDate.slice(0, 7)) : parseYm(undefined);
  const ym = sp.ym ? parseYm(sp.ym) : defaultYm;
  const days = monthDays(ym);

  // 塾の予定（管理者が入れたもの）。休校日には希望を出せない。
  const events = await eventsBetween(days[0], days[days.length - 1]);

  // 入力できるのは「選んでいるコマタイプの期間内」かつ「休校日でない」日
  const inKind = (date: string) => termKindOfDate(date, terms) === kind;
  const enterable = (date: string) => inKind(date) && !isClosed(date, events);
  const targetDays = days.filter(enterable);

  const [requests, myAssignments] = await Promise.all([
    prisma.shiftRequest.findMany({
      where: { teacherId: teacher.id, date: { in: days } },
    }),
    // 管理者が確定させた自分のシフト。講師は「いつ出勤なのか」をここで知る。
    prisma.shiftAssignment.findMany({
      where: { teacherId: teacher.id, date: { in: days } },
    }),
  ]);
  const assignedOf = (date: string) =>
    myAssignments.filter((a) => a.date === date);
  const isAssigned = (date: string, periodId: number) =>
    myAssignments.some((a) => a.date === date && a.periodId === periodId);
  const assignedTotal = myAssignments.length;

  const selectedDay =
    sp.day && targetDays.includes(sp.day)
      ? sp.day
      : targetDays.includes(todayISO())
        ? todayISO()
        : (targetDays[0] ?? days[0]);

  const reqOf = (date: string, periodId: number) =>
    requests.find((r) => r.date === date && r.periodId === periodId);

  // 集計はこのコマタイプの日だけを対象にする
  const mine = requests.filter((r) => enterable(r.date));
  const answered = mine.length;
  const okCount = mine.filter((r) => r.status !== SHIFT.NG).length;
  const total = targetDays.length * periods.length;

  const qs = (o: Record<string, string>) =>
    new URLSearchParams({ kind, ym: formatYm(ym), ...o }).toString();

  const selectedTerm = terms.find(
    (t) => selectedDay >= t.startDate && selectedDay <= t.endDate,
  );
  const selectedEnterable = enterable(selectedDay);

  return (
    <div className="space-y-3">
      <h1 className="font-bold text-slate-900">シフト提出</h1>

      <TermKindTabs
        tabs={tabs}
        current={kind}
        href={(k) => `/t?kind=${k}`}
        size="sm"
      />

      {kindTerms.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          {TERM_KIND_LABEL[kind]}の期間はまだ登録されていません
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              {kindTerms.map((t) => `${t.startDate}〜${t.endDate}`).join("／")}
            </p>
            <div className="flex items-center gap-1">
              <Link
                href={`/t?${qs({ ym: formatYm(addMonths(ym, -1)) })}`}
                className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 bg-white rounded"
              >
                ←
              </Link>
              <span className="text-sm font-medium text-slate-900 tabular-nums w-20 text-center">
                {ym.year}年{ym.month}月
              </span>
              <Link
                href={`/t?${qs({ ym: formatYm(addMonths(ym, 1)) })}`}
                className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 bg-white rounded"
              >
                →
              </Link>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {targetDays.length === 0
                ? "この月に対象日はありません"
                : answered > 0
                  ? `${okCount}コマ出られる／${answered}コマ回答済${assignedTotal > 0 ? `／確定${assignedTotal}コマ` : ""}`
                  : assignedTotal > 0
                    ? `確定${assignedTotal}コマ（希望は未回答）`
                    : "まだ回答していません"}
            </span>
            <div className="flex items-center gap-2 text-[10px]">
              <span className={MARK_CLASS.PREFER}>◎入りたい</span>
              <span className={MARK_CLASS.OK}>○出られる</span>
              <span className={MARK_CLASS.NG}>×不可</span>
            </div>
          </div>

          {targetDays.length > 0 && answered < total && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              未回答が {total - answered} コマあります。下の「曜日でまとめて」が早いです。
            </p>
          )}

          {/* カレンダー */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  {WEEKDAYS.map((w, i) => (
                    <th
                      key={w}
                      className={`py-1 text-[11px] font-medium border-b border-slate-200 ${
                        i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-500"
                      }`}
                    >
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthGrid(ym).map((week, wi) => (
                  <tr key={wi}>
                    {week.map((date, di) => {
                      if (!date)
                        return (
                          <td key={di} className="bg-slate-50/60 border border-slate-100" />
                        );

                      // 入力できない日（期間外・休校日）は灰色にして押せなくする
                      if (!enterable(date)) {
                        const closed = isClosed(date, events);
                        return (
                          <td
                            key={di}
                            className={`border border-slate-100 p-0 align-top ${
                              closed ? "bg-rose-50" : "bg-slate-50"
                            }`}
                          >
                            <div className="px-0.5 py-1 min-h-12 text-center">
                              <span
                                className={`text-[11px] tabular-nums ${
                                  closed ? "text-rose-300" : "text-slate-300"
                                }`}
                              >
                                {dayOfMonth(date)}
                              </span>
                              {closed && (
                                <div
                                  className="text-[9px] text-rose-600 leading-none"
                                  title={eventsOn(date, events)
                                    .map((e) => e.title)
                                    .join("、")}
                                >
                                  閉
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      }

                      const dayEvents = eventsOn(date, events);

                      const isSelected = date === selectedDay;
                      const isToday = date === todayISO();
                      return (
                        <td
                          key={di}
                          className={`border border-slate-100 p-0 ${
                            isSelected ? "ring-2 ring-inset ring-indigo-500" : ""
                          }`}
                        >
                          <Link
                            href={`/t?${qs({ day: date })}`}
                            className="block px-0.5 py-1 min-h-12 active:bg-slate-100"
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <span
                                className={`text-[11px] tabular-nums ${
                                  isToday
                                    ? "bg-indigo-600 text-white rounded px-1"
                                    : di === 0
                                      ? "text-rose-500"
                                      : di === 6
                                        ? "text-sky-500"
                                        : "text-slate-600"
                                }`}
                              >
                                {dayOfMonth(date)}
                              </span>
                              {dayEvents.length > 0 && (
                                <span
                                  className="w-1 h-1 rounded-full bg-sky-500"
                                  title={dayEvents.map((e) => e.title).join("、")}
                                />
                              )}
                            </div>
                            <div className="mt-0.5 flex justify-center flex-wrap gap-px leading-none">
                              {periods.map((p) => {
                                const r = reqOf(date, p.id);
                                return (
                                  <span
                                    key={p.id}
                                    className={`text-[9px] ${
                                      r ? MARK_CLASS[r.status] : "text-slate-200"
                                    }`}
                                  >
                                    {r ? SHIFT_MARK[r.status] : "・"}
                                  </span>
                                );
                              })}
                            </div>
                            {assignedOf(date).length > 0 && (
                              <div className="text-[8px] text-indigo-700 font-bold leading-none text-center mt-0.5">
                                ●{assignedOf(date).length}
                              </div>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
              灰色の日は{TERM_KIND_LABEL[kind]}の期間外、
              <span className="text-rose-500">赤い「閉」</span>は休校日、
              青い点は塾の予定です。
              <span className="text-indigo-700 font-bold">●数字</span>
              は確定した出勤コマの数です。
            </p>
          </div>

          {/* 選んだ日 */}
          {selectedEnterable && (
            <section className="bg-white border border-slate-200 rounded-lg">
              <div className="px-3 py-2 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900 text-sm">
                  {formatDateJP(selectedDay)}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {selectedTerm
                    ? `${selectedTerm.name}（${TERM_KIND_LABEL[kind]}）`
                    : TERM_KIND_LABEL[kind]}
                  ・{periods.length}コマ
                </p>
                {eventsOn(selectedDay, events).map((e) => (
                  <p key={e.id} className="text-[11px] text-sky-700 mt-1">
                    {e.title}
                    {e.note && (
                      <span className="text-slate-400 ml-1">／{e.note}</span>
                    )}
                  </p>
                ))}
              </div>
              <div className="p-3 space-y-2.5">
                {periods.map((p) => {
                  const r = reqOf(selectedDay, p.id);
                  return (
                    <div key={p.id}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {p.startTime}-{p.endTime}
                        </span>
                        {isAssigned(selectedDay, p.id) && (
                          <span className="text-[9px] bg-indigo-600 text-white rounded px-1.5 py-0.5">
                            出勤確定
                          </span>
                        )}
                      </div>
                      <form action={submitMyShift} className="flex gap-1">
                        <input type="hidden" name="date" value={selectedDay} />
                        <input type="hidden" name="periodId" value={p.id} />
                        {[SHIFT.PREFER, SHIFT.OK, SHIFT.NG].map((s) => (
                          <button
                            key={s}
                            type="submit"
                            name="status"
                            value={s}
                            className={`flex-1 text-xs px-1 py-1.5 rounded border ${
                              r?.status === s
                                ? s === SHIFT.NG
                                  ? "bg-rose-500 border-rose-500 text-white font-medium"
                                  : s === SHIFT.PREFER
                                    ? "bg-indigo-600 border-indigo-600 text-white font-medium"
                                    : "bg-slate-700 border-slate-700 text-white font-medium"
                                : "bg-white border-slate-200 text-slate-600"
                            }`}
                          >
                            {SHIFT_MARK[s]}
                            <br />
                            <span className="text-[10px]">{SHIFT_LABEL[s]}</span>
                          </button>
                        ))}
                      </form>
                    </div>
                  );
                })}
                <p className="text-[10px] text-slate-400">
                  同じものをもう一度押すと未回答に戻ります
                </p>
              </div>
            </section>
          )}

          {/* 曜日でまとめて */}
          {targetDays.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-lg">
              <div className="px-3 py-2 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900 text-sm">曜日でまとめて</h2>
                <p className="text-[11px] text-slate-500">
                  {ym.month}月の{TERM_KIND_LABEL[kind]}期間の、同じ曜日にまとめて入れます
                </p>
              </div>
              <form action={bulkSetMyShifts} className="p-3 space-y-2.5">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="ym" value={formatYm(ym)} />

                <select
                  name="dow"
                  defaultValue={String(dayOfWeek(selectedDay))}
                  className="w-full border border-slate-200 rounded px-2 py-2 text-sm"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={i} value={i}>
                      毎週 {w}曜
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {periods.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        name="periodIds"
                        value={p.id}
                        defaultChecked
                        className="rounded border-slate-300"
                      />
                      <span className="text-slate-700">{p.name}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-1">
                  {[SHIFT.PREFER, SHIFT.OK, SHIFT.NG].map((s) => (
                    <button
                      key={s}
                      type="submit"
                      name="status"
                      value={s}
                      className="flex-1 text-xs px-1 py-2 rounded border border-slate-200 bg-white text-slate-700"
                    >
                      {SHIFT_MARK[s]}にする
                    </button>
                  ))}
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
