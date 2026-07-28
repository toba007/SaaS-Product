import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { punchTeacher } from "../actions";
import { punchMinutes } from "@/lib/attendance";
import { formatMinutes } from "@/lib/payroll";
import { formatDateJP, todayISO } from "@/lib/constants";

export const metadata = { title: "打刻｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 教室に置く端末用の打刻画面。
 * 名前を押すだけ。出勤中なら退勤になるので「出勤／退勤」を選ばせない。
 */
export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayISO();

  const [teachers, punches] = await Promise.all([
    prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.punch.findMany({ where: { date }, orderBy: { inAt: "asc" } }),
  ]);

  const working = teachers.filter((t) =>
    punches.some((p) => p.teacherId === t.id && !p.outAt),
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">打刻</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDateJP(date)}／名前を押してください
          </p>
        </div>
        <Link
          href={`/attendance?date=${date}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          勤怠管理へ →
        </Link>
      </div>

      <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
        いま出勤中: <span className="font-bold text-slate-900">{working.length}</span> 名
        {working.length > 0 && (
          <span className="text-slate-500 ml-2">
            {working.map((t) => t.name).join("、")}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {teachers.map((t) => {
          const mine = punches.filter((p) => p.teacherId === t.id);
          const open = mine.find((p) => !p.outAt);
          const worked = mine.reduce(
            (s, p) => s + punchMinutes(p.inAt, p.outAt),
            0,
          );
          return (
            <form key={t.id} action={punchTeacher}>
              <input type="hidden" name="teacherId" value={t.id} />
              <input type="hidden" name="date" value={date} />
              <button
                type="submit"
                className={`w-full text-left rounded-lg border-2 px-4 py-4 transition ${
                  open
                    ? "bg-emerald-50 border-emerald-500 hover:bg-emerald-100"
                    : "bg-white border-slate-200 hover:border-slate-400"
                }`}
              >
                <div className="font-bold text-slate-900">{t.name}</div>
                <div className="text-xs mt-1">
                  {open ? (
                    <span className="text-emerald-700 font-medium">
                      出勤中 {open.inAt}〜　押すと退勤
                    </span>
                  ) : mine.length > 0 ? (
                    <span className="text-slate-500">
                      退勤済 実働{formatMinutes(worked)}　押すと再び出勤
                    </span>
                  ) : (
                    <span className="text-slate-400">未出勤　押すと出勤</span>
                  )}
                </div>
              </button>
            </form>
          );
        })}
      </div>

      <div className="text-center">
        <Link
          href="/attendance/qr"
          className="text-sm text-slate-500 hover:text-indigo-600 hover:underline"
        >
          二次元コードのカードを印刷する →
        </Link>
      </div>
    </div>
  );
}
