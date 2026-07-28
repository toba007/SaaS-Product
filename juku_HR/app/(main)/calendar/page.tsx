import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EventForm } from "./EventForm";
import { deleteEvent } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { eventsOn, isClosed, type EventLite } from "@/lib/events";
import { termKindOfDate } from "@/lib/terms";
import {
  EVENT_KIND,
  EVENT_KIND_LABEL,
  TERM_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import {
  WEEKDAYS,
  addMonths,
  dayOfMonth,
  formatYm,
  monthGrid,
  parseYm,
} from "@/lib/dates";

export const metadata = { title: "塾の予定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const ym = parseYm(sp.ym);
  const view = sp.view === "year" ? "year" : "month";

  // 年間表示のときはその年ぶん、月表示のときは前後に少し余裕を持って取る
  const from = view === "year" ? `${ym.year}-01-01` : `${ym.year}-01-01`;
  const to = view === "year" ? `${ym.year}-12-31` : `${ym.year}-12-31`;

  const [events, terms] = await Promise.all([
    prisma.schoolEvent.findMany({
      where: { endDate: { gte: from }, startDate: { lte: to } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  const closedCount = events.filter((e) => e.kind === EVENT_KIND.CLOSED).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">塾の予定</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ここで入れた予定は、講師のシフト画面のカレンダーにも出ます。
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[
            { key: "month", label: "月" },
            { key: "year", label: "年間" },
          ].map((v) => (
            <Link
              key={v.key}
              href={`/calendar?view=${v.key}&ym=${formatYm(ym)}`}
              className={`px-3 py-1.5 text-sm rounded border ${
                view === v.key
                  ? "bg-slate-900 border-slate-900 text-white font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-3">
          {view === "month" ? (
            <MonthView ym={ym} events={events} terms={terms} />
          ) : (
            <YearView year={ym.year} events={events} />
          )}
        </div>

        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2.5 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900 text-sm">予定を追加</h2>
            </div>
            <EventForm defaultDate={todayISO()} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-900 text-sm">
                {ym.year}年の予定
              </h2>
              <span className="text-[11px] text-slate-400">
                {events.length}件（休校{closedCount}件）
              </span>
            </div>
            {events.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                まだ予定がありません
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.id} className="px-3 py-2 flex items-start gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                        e.kind === EVENT_KIND.CLOSED
                          ? "bg-rose-100 text-rose-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {EVENT_KIND_LABEL[e.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-900 truncate">
                        {e.title}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {e.startDate === e.endDate
                          ? formatDateJP(e.startDate)
                          : `${formatDateJP(e.startDate)} 〜 ${formatDateJP(e.endDate)}`}
                        {e.note && <span className="ml-1">／{e.note}</span>}
                      </div>
                    </div>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <ConfirmSubmit
                        message={`「${e.title}」を削除しますか？${e.kind === EVENT_KIND.CLOSED ? " 休校日でなくなると、この日にシフトを出せるようになります。" : ""}`}
                        className="text-[10px] text-slate-400 hover:text-rose-600 shrink-0"
                      >
                        削除
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MonthView({
  ym,
  events,
  terms,
}: {
  ym: { year: number; month: number };
  events: EventLite[];
  terms: { kind: string; startDate: string; endDate: string; name: string }[];
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          日付を見ながら予定を確認できます
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?ym=${formatYm(addMonths(ym, -1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900 tabular-nums w-24 text-center">
            {ym.year}年{ym.month}月
          </span>
          <Link
            href={`/calendar?ym=${formatYm(addMonths(ym, 1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              {WEEKDAYS.map((w, i) => (
                <th
                  key={w}
                  className={`py-1.5 text-xs font-medium border-b border-slate-200 ${
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
                    return <td key={di} className="bg-slate-50/60 border border-slate-100" />;

                  const on = eventsOn(date, events);
                  const closed = isClosed(date, events);
                  const kind = termKindOfDate(date, terms);

                  return (
                    <td
                      key={di}
                      className={`border border-slate-100 align-top p-1 h-20 ${
                        closed ? "bg-rose-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs tabular-nums ${
                            date === todayISO()
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
                        {closed && (
                          <span className="text-[9px] bg-rose-500 text-white rounded px-1">
                            閉
                          </span>
                        )}
                        {kind !== "REGULAR" && (
                          <span className="text-[9px] text-amber-700">
                            {TERM_KIND_LABEL[kind].replace("講習", "")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {on.map((e) => (
                          <div
                            key={e.id}
                            title={e.note || e.title}
                            className={`text-[9px] leading-tight truncate rounded px-1 ${
                              e.kind === EVENT_KIND.CLOSED
                                ? "bg-rose-100 text-rose-800"
                                : "bg-sky-50 text-sky-800"
                            }`}
                          >
                            {e.title}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function YearView({ year, events }: { year: number; events: EventLite[] }) {
  const byMonth = new Map<number, EventLite[]>();
  for (const e of events) {
    const m = Number(e.startDate.slice(5, 7));
    const list = byMonth.get(m) ?? [];
    list.push(e);
    byMonth.set(m, list);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">1年ぶんの予定をまとめて確認できます</p>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?view=year&ym=${year - 1}-01`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900 tabular-nums w-16 text-center">
            {year}年
          </span>
          <Link
            href={`/calendar?view=year&ym=${year + 1}-01`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const list = byMonth.get(m) ?? [];
          return (
            <div key={m} className="px-4 py-2 flex gap-3">
              <Link
                href={`/calendar?ym=${year}-${String(m).padStart(2, "0")}`}
                className="w-12 shrink-0 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline"
              >
                {m}月
              </Link>
              {list.length === 0 ? (
                <span className="text-xs text-slate-300">—</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((e) => (
                    <span
                      key={e.id}
                      title={
                        e.startDate === e.endDate
                          ? formatDateJP(e.startDate)
                          : `${formatDateJP(e.startDate)}〜${formatDateJP(e.endDate)}`
                      }
                      className={`text-[11px] rounded px-1.5 py-0.5 ${
                        e.kind === EVENT_KIND.CLOSED
                          ? "bg-rose-100 text-rose-800"
                          : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {Number(e.startDate.slice(8, 10))}
                      {e.startDate !== e.endDate &&
                        `-${Number(e.endDate.slice(8, 10))}`}{" "}
                      {e.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
