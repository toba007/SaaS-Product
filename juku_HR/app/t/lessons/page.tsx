import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { ATTENDANCE, FORMAT_LABEL, formatDateJP, todayISO } from "@/lib/constants";
import { shiftDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function MyLessonsPage() {
  const teacher = await requireAuth("/t/lessons");

  // 直近2週間ぶん。過去の書き忘れを拾えるように、今日より前も出す。
  const from = shiftDays(todayISO(), -14);
  const to = todayISO();

  const lessons = await prisma.lesson.findMany({
    where: { teacherId: teacher.id, date: { gte: from, lte: to } },
    include: {
      period: true,
      subject: true,
      room: true,
      record: true,
      attendances: true,
    },
    orderBy: [{ date: "desc" }, { period: { order: "asc" } }],
  });

  const unrecorded = lessons.filter((l) => !l.record);

  const byDate = new Map<string, typeof lessons>();
  for (const l of lessons) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold text-slate-900">授業記録</h1>
        <p className="text-[11px] text-slate-500">
          担当した授業の進んだ内容と宿題を書きます
        </p>
      </div>

      {unrecorded.length > 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          記録がまだの授業が {unrecorded.length} コマあります
        </p>
      ) : lessons.length > 0 ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          直近2週間ぶん、すべて記録済みです
        </p>
      ) : null}

      {lessons.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          直近2週間に担当した授業はありません
        </p>
      ) : (
        [...byDate.entries()].map(([date, list]) => (
          <section key={date} className="space-y-1.5">
            <h2 className="text-xs font-medium text-slate-500 px-1">
              {formatDateJP(date)}
              {date === todayISO() && (
                <span className="ml-1.5 text-[10px] bg-indigo-600 text-white rounded px-1">
                  今日
                </span>
              )}
            </h2>
            <ul className="space-y-1.5">
              {list.map((l) => {
                const absent = l.attendances.filter(
                  (a) => a.status === ATTENDANCE.ABSENT,
                ).length;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/t/lessons/${l.id}`}
                      className="block bg-white border border-slate-200 rounded-lg px-3 py-2.5 active:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-500 shrink-0">
                          {l.period.startTime}
                        </span>
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {l.title || `${FORMAT_LABEL[l.format]} ${l.subject.name}`}
                        </span>
                        <span className="ml-auto shrink-0">
                          {l.record ? (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              記録済
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              未記録
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-400">
                          {l.room.name}／{l.attendances.length}名
                        </span>
                        {absent > 0 && (
                          <span className="text-[10px] text-amber-800 bg-amber-100 px-1 rounded">
                            欠席{absent}
                          </span>
                        )}
                      </div>
                      {l.record?.progress && (
                        <p className="text-[11px] text-slate-500 mt-1 truncate">
                          {l.record.progress}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
