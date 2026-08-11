import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { loadSummary, spread } from "@/lib/shifts";
import {
  CARD_STATUS,
  TERM_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import { WEEKDAYS, dayOfWeek, monthDays, parseYm, weekDays, withinTerm } from "@/lib/dates";
import { eventsBetween, isClosed } from "@/lib/events";

export const metadata = { title: "ダッシュボード｜塾HR" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const today = todayISO();
  const week = weekDays(today);
  const mdays = monthDays(parseYm(today.slice(0, 7)));

  const [rows, todayAssignments, unanswered, pendingCards, term, unreadMessages, todayEvents, monthDuties, wageRates] =
    await Promise.all([
      loadSummary(week[0], week[6]),
      prisma.shiftAssignment.findMany({
        where: { date: today },
        include: { teacher: true, period: true },
        orderBy: { period: { startTime: "asc" } },
      }),
      // 今週まだ1コマも希望を出していない講師
      prisma.teacher.findMany({
        where: {
          active: true,
          requests: { none: { date: { gte: week[0], lte: week[6] } } },
        },
      }),
      prisma.absenceCard.count({ where: { status: { not: CARD_STATUS.DELIVERED } } }),
      prisma.term
        .findMany()
        .then((ts) => ts.find((t) => withinTerm(today, t)) ?? null),
      prisma.message.findMany({
        where: { recipients: { some: { readAt: null } } },
        include: { recipients: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      eventsBetween(today, today),
      // 給与の単価が未設定の形態で働いた実績が今月あるか（金額が過少に出るので警告する）
      prisma.dutyRecord.findMany({
        where: { date: { gte: mdays[0], lte: mdays[mdays.length - 1] } },
        select: { teacherId: true, style: true },
      }),
      prisma.wageRate.findMany({ select: { teacherId: true, style: true } }),
    ]);

  const gap = spread(rows);
  const totalAssigned = rows.reduce((s, r) => s + r.assigned, 0);
  const conflicts = rows.reduce((s, r) => s + r.conflicts, 0);

  const closedToday = isClosed(today, todayEvents);
  const rateKey = new Set(wageRates.map((r) => `${r.teacherId}:${r.style}`));
  const unratedNames = [
    ...new Set(
      monthDuties
        .filter((d) => !rateKey.has(`${d.teacherId}:${d.style}`))
        .map((d) => rows.find((r) => r.teacherId === d.teacherId)?.name)
        .filter((n): n is string => !!n),
    ),
  ];

  const byPeriod = new Map<string, typeof todayAssignments>();
  for (const a of todayAssignments) {
    const list = byPeriod.get(a.period.name) ?? [];
    list.push(a);
    byPeriod.set(a.period.name, list);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {formatDateJP(today)}
          {term && (
            <span className="ml-2 text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
              {term.name}（{TERM_KIND_LABEL[term.kind]}）
            </span>
          )}
        </p>
      </div>

      {closedToday ? (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          今日は休校日です（
          {todayEvents
            .filter((e) => e.kind === "CLOSED")
            .map((e) => e.title)
            .join("、")}
          ）
        </p>
      ) : (
        todayEvents.length > 0 && (
          <p className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            今日の予定:{" "}
            {todayEvents.map((e) => e.title + (e.note ? `（${e.note}）` : "")).join("、")}
          </p>
        )
      )}

      {unratedNames.length > 0 && (
        <Link
          href="/payroll/settings"
          className="block text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 hover:bg-rose-100"
        >
          給与の単価が入っていない授業形態で働いた実績があります（
          {unratedNames.join("、")}）。給与設定へ →
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="今日出勤する講師"value={new Set(todayAssignments.map((a) => a.teacherId)).size} unit="名" tone="plain" />
        <Stat label="今週の確定コマ" value={totalAssigned} unit="コマ" tone="plain" />
        <Stat
          label="今週の偏り"
          value={gap}
          unit="コマ差"
          tone={gap >= 4 ? "bad" : gap >= 2 ? "warn" : "ok"}
          href="/shifts/board"
        />
        <Stat
          label="希望が未提出"
          value={unanswered.length}
          unit="名"
          tone={unanswered.length > 0 ? "warn" : "ok"}
          href="/shifts"
        />
      </div>

      {conflicts > 0 && (
        <Link
          href="/shifts/board"
          className="block text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 hover:bg-rose-100"
        >
          「出られない」と回答されているコマに {conflicts} 件の確定が入っています →
        </Link>
      )}

      {unanswered.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900 text-sm">
            今週の希望がまだ出ていない講師
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unanswered.map((t) => (
              <Link
                key={t.id}
                href={`/shifts?teacher=${t.id}`}
                className="text-xs border border-slate-200 rounded px-2 py-1 hover:border-indigo-400 hover:bg-indigo-50"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-900">今日のシフト</h2>
          <Link
            href="/shifts/board"
            className="text-sm text-indigo-600 hover:underline"
          >
            調整＆確定 →
          </Link>
        </div>
        {todayAssignments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            今日の確定シフトはありません
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...byPeriod.entries()].map(([periodName, list]) => (
              <li key={periodName} className="px-4 py-2.5 flex gap-3">
                <div className="w-24 shrink-0">
                  <div className="text-sm font-medium text-slate-900">
                    {periodName}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {list[0].period.startTime}-{list[0].period.endTime}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((a) => (
                    <span
                      key={a.id}
                      className="text-xs bg-slate-100 text-slate-700 rounded px-2 py-1"
                    >
                      {a.teacher.name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-900">今週の割当</h2>
          <span className="text-xs text-slate-500">
            {WEEKDAYS[dayOfWeek(week[0])]}
            {formatDateJP(week[0])} 〜 {formatDateJP(week[6])}
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {[...rows]
            .sort((a, b) => b.assigned - a.assigned)
            .map((r) => {
              const max = Math.max(1, ...rows.map((x) => x.assigned));
              return (
                <li key={r.teacherId} className="px-4 py-2 flex items-center gap-3">
                  <span className="text-sm text-slate-900 w-24 shrink-0 truncate">
                    {r.name}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-900 w-6 text-right">
                    {r.assigned}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${(r.assigned / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 tabular-nums w-20 text-right">
                    希望{r.available}／
                    {r.fillRate === null ? "—" : `${Math.round(r.fillRate * 100)}%`}
                  </span>
                </li>
              );
            })}
        </ul>
      </section>

      {unreadMessages.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
            <h2 className="font-semibold text-slate-900">未読のある連絡</h2>
            <Link href="/messages" className="text-sm text-indigo-600 hover:underline">
              講師連絡 →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {unreadMessages.map((m) => {
              const unread = m.recipients.filter((r) => !r.readAt).length;
              return (
                <li key={m.id}>
                  <Link
                    href={`/messages/${m.id}`}
                    className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50"
                  >
                    <span className="text-sm text-slate-900 truncate">{m.title}</span>
                    <span className="ml-auto text-xs text-amber-800 bg-amber-100 rounded px-2 py-0.5 shrink-0">
                      未読{unread}名
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pendingCards > 0 && (
        <Link
          href="/cards"
          className="block bg-white rounded-lg border border-slate-200 px-4 py-3 hover:border-indigo-300"
        >
          <span className="text-sm text-slate-600">
            未渡しの欠席者カードが{" "}
            <span className="font-bold text-slate-900">{pendingCards}枚</span>{" "}
            あります
          </span>
        </Link>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
  href,
}: {
  label: string;
  value: number;
  unit: string;
  tone: "ok" | "warn" | "bad" | "plain";
  href?: string;
}) {
  const color =
    tone === "bad"
      ? "text-rose-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "ok"
          ? "text-emerald-600"
          : "text-slate-900";

  const inner = (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 ${color}`}>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        <span className="text-sm ml-1">{unit}</span>
      </div>
    </>
  );

  const cls = "bg-white rounded-lg border border-slate-200 px-4 py-3 block";
  return href ? (
    <Link href={href} className={`${cls} hover:border-indigo-300`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
