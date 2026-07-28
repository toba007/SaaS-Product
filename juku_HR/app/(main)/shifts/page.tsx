import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  bulkSetShiftRequests,
  clearMonthRequests,
  submitShiftRequest,
} from "./actions";
import { TermKindTabs } from "@/app/components/TermKindTabs";
import { parseTermKind, termKindOfDate, termKindTabs } from "@/lib/terms";
import { eventsBetween, isClosed } from "@/lib/events";
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

export const metadata = { title: "希望の確認・代理入力｜塾HR" };
export const dynamic = "force-dynamic";

const MARK_CLASS: Record<string, string> = {
  OK: "text-slate-600",
  PREFER: "text-indigo-600 font-bold",
  NG: "text-rose-400",
};

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; teacher?: string; ym?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const kind = parseTermKind(sp.kind);

  const [teachers, tabs, terms] = await Promise.all([
    prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    termKindTabs(),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  if (teachers.length === 0) {
    return <Empty message="講師が登録されていません。npm run seed を実行してください。" />;
  }

  const teacherId = Number(sp.teacher) || teachers[0].id;
  const teacher = teachers.find((t) => t.id === teacherId) ?? teachers[0];

  // このコマタイプのコマ
  const periods = await prisma.period.findMany({
    where: { termKind: kind },
    orderBy: { order: "asc" },
  });

  const kindTerms = terms.filter((t) => t.kind === kind);
  const defaultYm =
    kindTerms.length > 0 ? parseYm(kindTerms[0].startDate.slice(0, 7)) : parseYm(undefined);
  const ym = sp.ym ? parseYm(sp.ym) : defaultYm;
  const days = monthDays(ym);

  // 塾の予定。休校日は入力できない（講師側と同じ扱い）。
  const events = await eventsBetween(days[0], days[days.length - 1]);
  const enterable = (date: string) =>
    termKindOfDate(date, terms) === kind && !isClosed(date, events);
  const targetDays = days.filter(enterable);

  const requests = await prisma.shiftRequest.findMany({
    where: { teacherId: teacher.id, date: { in: days } },
  });

  const selectedDay =
    sp.day && targetDays.includes(sp.day)
      ? sp.day
      : targetDays.includes(todayISO())
        ? todayISO()
        : (targetDays[0] ?? days[0]);

  const reqOf = (date: string, periodId: number) =>
    requests.find((r) => r.date === date && r.periodId === periodId);

  const mine = requests.filter((r) => enterable(r.date));
  const answered = mine.length;
  const okCount = mine.filter((r) => r.status !== SHIFT.NG).length;

  const qs = (o: Record<string, string>) =>
    new URLSearchParams({
      kind,
      teacher: String(teacher.id),
      ym: formatYm(ym),
      ...o,
    }).toString();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">希望の確認・代理入力</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          提出は講師がスマホで行います（
          <Link href="/teachers" className="text-indigo-600 hover:underline">
            講師のログインID
          </Link>
          ）。ここは確認と、出せない講師のぶんの代理入力用です。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
        <TermKindTabs tabs={tabs} current={kind} href={(k) => `/shifts?kind=${k}&teacher=${teacher.id}`} />

        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1">選択中の講師</div>
          <div className="flex flex-wrap gap-1">
            {teachers.map((t) => (
              <Link
                key={t.id}
                href={`/shifts?${new URLSearchParams({ kind, teacher: String(t.id) })}`}
                className={`text-sm px-2.5 py-1 rounded border ${
                  t.id === teacher.id
                    ? "bg-slate-900 border-slate-900 text-white font-medium"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {kindTerms.length === 0 ? (
        <Empty message={`${TERM_KIND_LABEL[kind]}の期間はまだ登録されていません`} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {TERM_KIND_LABEL[kind]}：
              {kindTerms.map((t) => `${t.startDate}〜${t.endDate}`).join("／")}
              ・1日{periods.length}コマ（{periods[0]?.startTime}〜
              {periods[periods.length - 1]?.endTime}）
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={`/shifts?${qs({ ym: formatYm(addMonths(ym, -1)) })}`}
                className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
              >
                ←
              </Link>
              <span className="text-sm font-medium text-slate-900 tabular-nums w-24 text-center">
                {ym.year}年{ym.month}月
              </span>
              <Link
                href={`/shifts?${qs({ ym: formatYm(addMonths(ym, 1)) })}`}
                className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
              >
                →
              </Link>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* カレンダー */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{teacher.name}</span>
                  <span className="text-slate-500 ml-2 text-xs">
                    {targetDays.length === 0
                      ? "この月に対象日はありません"
                      : answered > 0
                        ? `${okCount}コマ出られる／${answered}コマ回答済`
                        : "まだ回答がありません"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={MARK_CLASS.PREFER}>◎ 入りたい</span>
                  <span className={MARK_CLASS.OK}>○ 出られる</span>
                  <span className={MARK_CLASS.NG}>× 不可</span>
                </div>
              </div>

              <table className="w-full table-fixed">
                <thead>
                  <tr>
                    {WEEKDAYS.map((w, i) => (
                      <th
                        key={w}
                        className={`py-1.5 text-xs font-medium border-b border-slate-200 ${
                          i === 0
                            ? "text-rose-500"
                            : i === 6
                              ? "text-sky-500"
                              : "text-slate-500"
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

                        if (!enterable(date)) {
                          const closed = isClosed(date, events);
                          return (
                            <td
                              key={di}
                              className={`border border-slate-100 p-0 ${
                                closed ? "bg-rose-50" : "bg-slate-50"
                              }`}
                            >
                              <div className="px-1.5 py-1 min-h-16">
                                <span
                                  className={`text-xs tabular-nums ${
                                    closed ? "text-rose-300" : "text-slate-300"
                                  }`}
                                >
                                  {dayOfMonth(date)}
                                </span>
                                {closed && (
                                  <span className="ml-1 text-[9px] bg-rose-500 text-white rounded px-1">
                                    閉
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        const isSelected = date === selectedDay;
                        const isToday = date === todayISO();
                        return (
                          <td
                            key={di}
                            className={`border border-slate-100 align-top p-0 ${
                              isSelected ? "ring-2 ring-inset ring-indigo-500" : ""
                            }`}
                          >
                            <Link
                              href={`/shifts?${qs({ day: date })}`}
                              className="block px-1.5 py-1 min-h-16 hover:bg-slate-50"
                            >
                              <span
                                className={`text-xs tabular-nums ${
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
                              <div className="mt-0.5 flex flex-wrap gap-px leading-none">
                                {periods.map((p) => {
                                  const r = reqOf(date, p.id);
                                  return (
                                    <span
                                      key={p.id}
                                      title={`${p.name} ${r ? SHIFT_LABEL[r.status] : "未回答"}`}
                                      className={`text-[10px] ${
                                        r ? MARK_CLASS[r.status] : "text-slate-200"
                                      }`}
                                    >
                                      {r ? SHIFT_MARK[r.status] : "・"}
                                    </span>
                                  );
                                })}
                              </div>
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100">
                灰色の日は{TERM_KIND_LABEL[kind]}の期間外、
                <span className="text-rose-500">赤い「閉」</span>は休校日です
              </p>
            </div>

            {/* 右 */}
            <div className="space-y-4">
              {enterable(selectedDay) && (
                <section className="bg-white border border-slate-200 rounded-lg">
                  <div className="px-4 py-2.5 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900 text-sm">
                      {formatDateJP(selectedDay)}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {TERM_KIND_LABEL[kind]}・{periods.length}コマ
                    </p>
                  </div>
                  <div className="p-3 space-y-2">
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
                          </div>
                          <form action={submitShiftRequest} className="flex gap-1">
                            <input type="hidden" name="teacherId" value={teacher.id} />
                            <input type="hidden" name="date" value={selectedDay} />
                            <input type="hidden" name="periodId" value={p.id} />
                            {[SHIFT.PREFER, SHIFT.OK, SHIFT.NG].map((s) => (
                              <button
                                key={s}
                                type="submit"
                                name="status"
                                value={s}
                                className={`flex-1 text-xs px-2 py-1.5 rounded border ${
                                  r?.status === s
                                    ? s === SHIFT.NG
                                      ? "bg-rose-500 border-rose-500 text-white font-medium"
                                      : s === SHIFT.PREFER
                                        ? "bg-indigo-600 border-indigo-600 text-white font-medium"
                                        : "bg-slate-700 border-slate-700 text-white font-medium"
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                                }`}
                              >
                                {SHIFT_MARK[s]}
                              </button>
                            ))}
                          </form>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-slate-400 pt-1">
                      同じものをもう一度押すと未回答に戻ります
                    </p>
                  </div>
                </section>
              )}

              {targetDays.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-lg">
                  <div className="px-4 py-2.5 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900 text-sm">曜日でまとめて</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ym.month}月の{TERM_KIND_LABEL[kind]}期間の、同じ曜日に入れます
                    </p>
                  </div>
                  <form action={bulkSetShiftRequests} className="p-3 space-y-2.5">
                    <input type="hidden" name="teacherId" value={teacher.id} />
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="ym" value={formatYm(ym)} />

                    <select
                      name="dow"
                      defaultValue={String(dayOfWeek(selectedDay))}
                      className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                    >
                      {WEEKDAYS.map((w, i) => (
                        <option key={i} value={i}>
                          毎週 {w}曜
                        </option>
                      ))}
                    </select>

                    <div className="space-y-1">
                      {periods.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="periodIds"
                            value={p.id}
                            defaultChecked
                            className="rounded border-slate-300"
                          />
                          <span className="text-slate-700">{p.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {p.startTime}-{p.endTime}
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-1 pt-1">
                      {[SHIFT.PREFER, SHIFT.OK, SHIFT.NG].map((s) => (
                        <button
                          key={s}
                          type="submit"
                          name="status"
                          value={s}
                          className="flex-1 text-xs px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          {SHIFT_MARK[s]}にする
                        </button>
                      ))}
                    </div>
                  </form>
                  <form
                    action={clearMonthRequests}
                    className="px-3 pb-3 border-t border-slate-100 pt-2.5"
                  >
                    <input type="hidden" name="teacherId" value={teacher.id} />
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="ym" value={formatYm(ym)} />
                    <button
                      type="submit"
                      className="text-xs text-slate-500 hover:text-rose-600 hover:underline"
                    >
                      {ym.month}月の{TERM_KIND_LABEL[kind]}期間の回答を消す
                    </button>
                  </form>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
