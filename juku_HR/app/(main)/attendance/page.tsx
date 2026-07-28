import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addAdminWork,
  applyAssignments,
  deleteAdminWork,
  deletePunch,
  punchTeacher,
  cycleDutyRecord,
  updatePunch,
} from "./actions";
import { punchMinutes } from "@/lib/attendance";
import { formatMinutes } from "@/lib/payroll";
import {
  EMPLOYMENT_LABEL,
  LESSON_STYLE_LABEL,
  LESSON_STYLE_SHORT,
  TERM_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import { shiftDays, withinTerm } from "@/lib/dates";
import { eventsBetween, isClosed } from "@/lib/events";

export const metadata = { title: "勤怠管理｜塾HR" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO();

  const [teachers, periods, punches, duties, adminWorks, assignments, term] =
    await Promise.all([
      prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
      prisma.period.findMany({ orderBy: { order: "asc" } }),
      prisma.punch.findMany({ where: { date }, orderBy: { inAt: "asc" } }),
      prisma.dutyRecord.findMany({ where: { date } }),
      prisma.adminWork.findMany({ where: { date }, orderBy: { id: "asc" } }),
      prisma.shiftAssignment.findMany({ where: { date } }),
      prisma.term.findMany().then((ts) => ts.find((t) => withinTerm(date, t)) ?? null),
    ]);

  const dayEvents = await eventsBetween(date, date);
  const closedNow = isClosed(date, dayEvents);

  // 出勤していない講師まで並べると縦に長いだけなので、
  // その日に関係のある講師（打刻・実績・予定のいずれかがある）だけ出す。
  const involved = teachers.filter(
    (t) =>
      punches.some((p) => p.teacherId === t.id) ||
      duties.some((d) => d.teacherId === t.id) ||
      adminWorks.some((a) => a.teacherId === t.id) ||
      assignments.some((a) => a.teacherId === t.id),
  );
  const others = teachers.filter((t) => !involved.some((i) => i.id === t.id));

  const notApplied = assignments.filter(
    (a) => !duties.some((d) => d.teacherId === a.teacherId && d.periodId === a.periodId),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">勤怠管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            1日に何回でも出退勤できます。担当コマと事務作業がそのまま給与計算の根拠になります。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/attendance?date=${shiftDays(date, -1)}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ← 前日
          </Link>
          <Link
            href="/attendance"
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            今日
          </Link>
          <Link
            href={`/attendance?date=${shiftDays(date, 1)}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            翌日 →
          </Link>
          <form method="get" className="flex items-center gap-1 ml-1">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
            />
            <button className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50">
              移動
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900">
          {formatDateJP(date)}
        </span>
        {term && (
          <span className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
            {term.name}（{TERM_KIND_LABEL[term.kind]}）
          </span>
        )}
        <Link
          href={`/attendance/kiosk?date=${date}`}
          className="ml-auto text-sm border border-slate-300 bg-white rounded px-3 py-1.5 hover:bg-slate-50"
        >
          打刻画面をひらく
        </Link>
      </div>

      {closedNow ? (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          この日は休校日です（
          {dayEvents
            .filter((e) => e.kind === "CLOSED")
            .map((e) => e.title)
            .join("、")}
          ）。出勤があった場合だけ記録してください。
        </p>
      ) : (
        dayEvents.length > 0 && (
          <p className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            この日の予定:{" "}
            {dayEvents.map((e) => e.title + (e.note ? `（${e.note}）` : "")).join("、")}
          </p>
        )
      )}

      {notApplied > 0 && (
        <form
          action={applyAssignments}
          className="flex flex-wrap items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2"
        >
          <input type="hidden" name="date" value={date} />
          <span className="text-sm text-indigo-900">
            確定シフトのうち {notApplied} コマが実績に入っていません。
          </span>
          <button
            type="submit"
            className="text-sm bg-indigo-600 text-white font-medium px-3 py-1.5 rounded hover:bg-indigo-700"
          >
            予定どおりで実績にする
          </button>
        </form>
      )}

      {involved.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          この日は誰も出勤予定・実績がありません
        </p>
      ) : (
        <div className="space-y-3">
          {involved.map((t) => {
            const myPunches = punches.filter((p) => p.teacherId === t.id);
            const myDuties = duties.filter((d) => d.teacherId === t.id);
            const myAdmin = adminWorks.filter((a) => a.teacherId === t.id);
            const myAssignments = assignments.filter((a) => a.teacherId === t.id);
            const open = myPunches.find((p) => !p.outAt);
            const worked = myPunches.reduce(
              (s, p) => s + punchMinutes(p.inAt, p.outAt),
              0,
            );
            const adminTotal = myAdmin.reduce((s, a) => s + a.minutes, 0);

            return (
              <section
                key={t.id}
                className="bg-white border border-slate-200 rounded-lg"
              >
                <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-900">{t.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {EMPLOYMENT_LABEL[t.employment]}
                  </span>
                  {open ? (
                    <span className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-0.5">
                      出勤中（{open.inAt}〜）
                    </span>
                  ) : myPunches.length > 0 ? (
                    <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">
                      退勤済 実働{formatMinutes(worked)}
                    </span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-800 rounded px-2 py-0.5">
                      打刻なし
                    </span>
                  )}
                  <form action={punchTeacher} className="ml-auto">
                    <input type="hidden" name="teacherId" value={t.id} />
                    <input type="hidden" name="date" value={date} />
                    <button
                      type="submit"
                      className={`text-sm font-medium px-3 py-1.5 rounded ${
                        open
                          ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {open ? "退勤" : "出勤"}
                    </button>
                  </form>
                </div>

                <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {/* 打刻 */}
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                      出退勤（1日に何回でも）
                    </div>
                    {myPunches.length === 0 ? (
                      <p className="text-xs text-slate-400">記録なし</p>
                    ) : (
                      <ul className="space-y-1">
                        {myPunches.map((p) => (
                          <li key={p.id} className="flex items-center gap-1">
                            <form
                              action={updatePunch}
                              className="flex items-center gap-1"
                            >
                              <input type="hidden" name="id" value={p.id} />
                              <input
                                type="time"
                                name="inAt"
                                defaultValue={p.inAt}
                                className="border border-slate-200 rounded px-1 py-0.5 text-xs w-20 font-mono"
                              />
                              <span className="text-slate-300 text-xs">〜</span>
                              <input
                                type="time"
                                name="outAt"
                                defaultValue={p.outAt ?? ""}
                                className="border border-slate-200 rounded px-1 py-0.5 text-xs w-20 font-mono"
                              />
                              <button
                                type="submit"
                                className="text-[11px] text-indigo-600 hover:underline px-1"
                              >
                                直す
                              </button>
                            </form>
                            <form action={deletePunch}>
                              <input type="hidden" name="id" value={p.id} />
                              <button
                                type="submit"
                                className="text-[11px] text-slate-400 hover:text-rose-600"
                              >
                                消す
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 担当コマ */}
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                      担当したコマ（コマ給の根拠）
                    </div>
                    <form action={cycleDutyRecord} className="flex gap-1">
                      <input type="hidden" name="teacherId" value={t.id} />
                      <input type="hidden" name="date" value={date} />
                      {periods.map((p) => {
                        const duty = myDuties.find((d) => d.periodId === p.id);
                        const planned = myAssignments.some(
                          (a) => a.periodId === p.id,
                        );
                        return (
                          <button
                            key={p.id}
                            type="submit"
                            name="periodId"
                            value={p.id}
                            title={
                              `${p.name} ${p.startTime}-${p.endTime}` +
                              (duty
                                ? `／${LESSON_STYLE_LABEL[duty.style]}`
                                : planned
                                  ? "／予定あり・未確定"
                                  : "／未担当") +
                              "（押すと 集団→1対1→1対2→未担当 と切り替わります）"
                            }
                            className={`flex-1 text-xs px-1 py-1.5 rounded border leading-tight ${
                              duty
                                ? "bg-indigo-600 border-indigo-600 text-white font-medium"
                                : planned
                                  ? "bg-white border-indigo-300 border-dashed text-indigo-500 hover:bg-indigo-50"
                                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"
                            }`}
                          >
                            {p.name}
                            <br />
                            <span className="text-[9px] font-normal">
                              {duty ? LESSON_STYLE_SHORT[duty.style] : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </form>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {myDuties.length}コマ
                      {myAssignments.length > 0 && (
                        <span className="ml-1">
                          （予定 {myAssignments.length}コマ・点線は未確定）
                        </span>
                      )}
                    </p>
                  </div>

                  {/* 事務作業 */}
                  <div className="p-3">
                    <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                      事務作業（時給の根拠）
                    </div>
                    {myAdmin.length > 0 && (
                      <ul className="space-y-0.5 mb-1.5">
                        {myAdmin.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="text-slate-900 font-medium tabular-nums">
                              {formatMinutes(a.minutes)}
                            </span>
                            <span className="text-slate-500 truncate">
                              {a.note || "—"}
                            </span>
                            <form action={deleteAdminWork} className="ml-auto">
                              <input type="hidden" name="id" value={a.id} />
                              <button
                                type="submit"
                                className="text-[11px] text-slate-400 hover:text-rose-600"
                              >
                                消す
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form action={addAdminWork} className="flex gap-1">
                      <input type="hidden" name="teacherId" value={t.id} />
                      <input type="hidden" name="date" value={date} />
                      <input
                        type="number"
                        name="minutes"
                        min="1"
                        step="5"
                        placeholder="分"
                        className="border border-slate-200 rounded px-2 py-1 text-xs w-16"
                      />
                      <input
                        type="text"
                        name="note"
                        placeholder="内容（例: 教材準備）"
                        className="border border-slate-200 rounded px-2 py-1 text-xs flex-1 min-w-0"
                      />
                      <button
                        type="submit"
                        className="text-xs border border-slate-300 bg-white px-2 py-1 rounded hover:bg-slate-50"
                      >
                        足す
                      </button>
                    </form>
                    {adminTotal > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        合計 {formatMinutes(adminTotal)}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">
            この日に予定のない講師（押すと出勤にできます）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {others.map((t) => (
              <form key={t.id} action={punchTeacher}>
                <input type="hidden" name="teacherId" value={t.id} />
                <input type="hidden" name="date" value={date} />
                <button
                  type="submit"
                  className="text-xs border border-slate-200 rounded px-2 py-1 hover:border-emerald-400 hover:bg-emerald-50"
                >
                  {t.name}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
