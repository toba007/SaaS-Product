import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  ATTENDANCE,
  FORMAT_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";

export const metadata = { title: "授業｜塾HR" };
export const dynamic = "force-dynamic";

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO();

  const lessons = await prisma.lesson.findMany({
    where: { date },
    include: {
      period: true,
      subject: true,
      teacher: true,
      room: true,
      record: true,
      attendances: true,
      cards: true,
    },
    orderBy: [{ period: { startTime: "asc" } }, { room: { name: "asc" } }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">授業</h1>
        <div className="flex items-center gap-1">
          <Link
            href={`/lessons?date=${shiftDate(date, -1)}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ← 前日
          </Link>
          <Link
            href="/lessons"
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            今日
          </Link>
          <Link
            href={`/lessons?date=${shiftDate(date, 1)}`}
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

      <p className="text-sm text-slate-600 font-medium">{formatDateJP(date)}</p>

      {lessons.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          この日の授業はありません
        </p>
      ) : (
        <ul className="space-y-2">
          {lessons.map((l) => {
            const absent = l.attendances.filter(
              (a) => a.status === ATTENDANCE.ABSENT,
            ).length;
            return (
              <li key={l.id}>
                <Link
                  href={`/lessons/${l.id}`}
                  className="block bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500 w-24 shrink-0">
                      {l.period.startTime}-{l.period.endTime}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        l.format === "GROUP"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-violet-50 text-violet-700"
                      }`}
                    >
                      {FORMAT_LABEL[l.format]}
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {l.title || l.subject.name}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {l.teacher.name} / {l.room.name}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">
                        {l.attendances.length}名
                      </span>
                      {absent > 0 && (
                        <span className="text-xs text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          欠席{absent}
                        </span>
                      )}
                      {l.record ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          記録済
                        </span>
                      ) : (
                        <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          記録がまだ
                        </span>
                      )}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
