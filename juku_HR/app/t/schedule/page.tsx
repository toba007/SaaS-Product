import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { unreadByDate } from "@/lib/comments";
import { DayChat } from "@/app/components/DayChat";
import { absoluteUrl } from "@/lib/qr";
import { CalendarLink } from "./CalendarLink";
import { eventsBetween, eventsOn, isClosed } from "@/lib/events";
import { termKindOfDate } from "@/lib/terms";
import {
  FORMAT_LABEL,
  PLAN_STATUS,
  ROLE,
  TERM_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import {
  WEEKDAYS,
  addMonths,
  dayOfMonth,
  formatYm,
  monthDays,
  monthGrid,
  parseYm,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * 確定シフトと時間割を見る画面。
 *
 * シフト提出（/t）とは別のカレンダーにしている。片方は「希望を入れる場所」、
 * こちらは「決まったことを見る場所」で、混ぜると今どちらを見ているのか分からなくなる。
 * ここでは何も編集できない。書けるのは備考のやりとりだけ。
 */
export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const teacher = await requireAuth("/t/schedule");

  const ym = parseYm(sp.ym);
  const days = monthDays(ym);
  const from = days[0];
  const to = days[days.length - 1];

  const [assignments, draftPlans, lessons, events, terms, unread] =
    await Promise.all([
      prisma.shiftAssignment.findMany({
        where: {
          teacherId: teacher.id,
          date: { gte: from, lte: to },
          // 検討中のシフトは見せない。確定していない予定で人が動いてしまうため。
          // 手で入れた割当（planId が null）は計画に属さないので従来どおり見せる。
          OR: [{ planId: null }, { plan: { status: PLAN_STATUS.CONFIRMED } }],
        },
        include: { period: true },
      }),
      // 調整中の計画がこの月にかかっているか。何も出ないのと「まだ決まっていない」
      // のは講師にとって別の話なので、区別して伝える。
      prisma.shiftPlan.count({
        where: {
          status: PLAN_STATUS.DRAFT,
          toDate: { gte: from },
          fromDate: { lte: to },
        },
      }),
      prisma.lesson.findMany({
        where: { teacherId: teacher.id, date: { gte: from, lte: to } },
        include: { period: true, subject: true, room: true },
      }),
      eventsBetween(from, to),
      prisma.term.findMany({ orderBy: { startDate: "asc" } }),
      unreadByDate(teacher.id, from, to, ROLE.TEACHER),
    ]);

  const assignedOn = (date: string) =>
    assignments
      .filter((a) => a.date === date)
      .sort((a, b) => a.period.order - b.period.order);
  const lessonsOn = (date: string) =>
    lessons
      .filter((l) => l.date === date)
      .sort((a, b) => a.period.order - b.period.order);

  // 予定のある日を優先して開く。何も無い月は1日を出す。
  const workDays = days.filter(
    (d) => assignedOn(d).length > 0 || lessonsOn(d).length > 0,
  );
  const selectedDay =
    sp.day && days.includes(sp.day)
      ? sp.day
      : workDays.includes(todayISO())
        ? todayISO()
        : (workDays.find((d) => d >= todayISO()) ?? workDays[0] ?? days[0]);

  const qs = (o: Record<string, string>) =>
    new URLSearchParams({ ym: formatYm(ym), ...o }).toString();

  const dayAssignments = assignedOn(selectedDay);
  const dayLessons = lessonsOn(selectedDay);
  const selectedClosed = isClosed(selectedDay, events);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold text-slate-900">確定シフト・時間割</h1>
        <p className="text-[11px] text-slate-500">
          教室が確定させた出勤と担当授業です。ここでは変更できません
        </p>
      </div>

      {draftPlans > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          この期間は教室が調整中です。確定するとここに出ます
        </p>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/t/schedule?ym=${formatYm(addMonths(ym, -1))}`}
          className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded"
        >
          ←
        </Link>
        <span className="text-sm font-medium text-slate-900 tabular-nums">
          {ym.year}年{ym.month}月
        </span>
        <Link
          href={`/t/schedule?ym=${formatYm(addMonths(ym, 1))}`}
          className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded"
        >
          →
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full table-fixed">
          <thead>
            <tr>
              {WEEKDAYS.map((w, i) => (
                <th
                  key={w}
                  className={`py-1 text-[11px] font-medium border-b border-slate-200 ${
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
                      <td
                        key={di}
                        className="bg-slate-50/60 border border-slate-100"
                      />
                    );

                  const closed = isClosed(date, events);
                  const shifts = assignedOn(date);
                  const lessonCount = lessonsOn(date).length;
                  const isSelected = date === selectedDay;
                  const unreadHere = unread.get(date) ?? 0;

                  return (
                    <td
                      key={di}
                      className={`border border-slate-100 p-0 ${
                        isSelected ? "ring-2 ring-inset ring-indigo-500" : ""
                      } ${closed ? "bg-rose-50" : ""}`}
                    >
                      <Link
                        href={`/t/schedule?${qs({ day: date })}`}
                        className="block px-0.5 py-1 min-h-12 active:bg-slate-100"
                      >
                        <div className="flex items-center justify-center">
                          <span
                            className={`text-[11px] tabular-nums ${
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
                        </div>
                        {shifts.length > 0 && (
                          <div className="text-[9px] text-indigo-700 font-bold leading-none text-center mt-0.5">
                            {shifts.length}コマ
                          </div>
                        )}
                        {lessonCount > 0 && (
                          <div className="text-[8px] text-slate-400 leading-none text-center mt-px">
                            授業{lessonCount}
                          </div>
                        )}
                        {unreadHere > 0 && (
                          <div className="text-[8px] leading-none text-center mt-0.5">
                            <span className="bg-rose-500 text-white rounded-full px-1 py-px">
                              {unreadHere}
                            </span>
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
          <span className="text-indigo-700 font-bold">数字コマ</span>
          は出勤が確定した数、
          <span className="bg-rose-500 text-white rounded-full px-1">数字</span>
          は教室からの未読です。
        </p>
      </div>

      {/* 選んだ日 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-3 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">
            {formatDateJP(selectedDay)}
          </h2>
          <p className="text-[11px] text-slate-500">
            {TERM_KIND_LABEL[termKindOfDate(selectedDay, terms)]}
            {selectedClosed && <span className="text-rose-600 ml-1">・休校</span>}
          </p>
          {eventsOn(selectedDay, events).map((e) => (
            <p key={e.id} className="text-[11px] text-sky-700 mt-1">
              {e.title}
            </p>
          ))}
        </div>

        {dayAssignments.length === 0 && dayLessons.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">
            この日の出勤はありません
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dayAssignments.map((a) => {
              // 同じコマの担当授業。出勤だけで授業が入っていないコマもある。
              const inPeriod = dayLessons.filter(
                (l) => l.periodId === a.periodId,
              );
              return (
                <li key={a.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {a.period.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {a.period.startTime}-{a.period.endTime}
                    </span>
                    <span className="text-[9px] bg-indigo-600 text-white rounded px-1.5 py-0.5">
                      出勤確定
                    </span>
                  </div>
                  {inPeriod.length === 0 ? (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      担当授業はまだ入っていません
                    </p>
                  ) : (
                    inPeriod.map((l) => (
                      <p key={l.id} className="text-[11px] text-slate-600 mt-0.5">
                        {l.subject.name}／{l.room.name}／{FORMAT_LABEL[l.format]}
                        {l.title && <span className="ml-1">（{l.title}）</span>}
                      </p>
                    ))
                  )}
                </li>
              );
            })}

            {/* 出勤が確定していないのに授業だけ入っている日。放っておくと当日に気づく */}
            {dayLessons
              .filter(
                (l) => !dayAssignments.some((a) => a.periodId === l.periodId),
              )
              .map((l) => (
                <li key={`lesson-${l.id}`} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {l.period.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {l.period.startTime}-{l.period.endTime}
                    </span>
                    <span className="text-[9px] bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                      授業のみ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {l.subject.name}／{l.room.name}／{FORMAT_LABEL[l.format]}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </section>

      <DayChat
        teacherId={teacher.id}
        date={selectedDay}
        viewerRole={ROLE.TEACHER}
        markRead={Boolean(sp.day)}
      />

      <CalendarLink url={await absoluteUrl(`/api/ics/${teacher.icsToken}`)} />
    </div>
  );
}
