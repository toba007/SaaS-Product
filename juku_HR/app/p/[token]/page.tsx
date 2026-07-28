import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { nowHM, punch, punchMinutes } from "@/lib/attendance";
import { formatMinutes } from "@/lib/payroll";
import { formatDateJP, todayISO } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * 二次元コードから開く打刻ページ。
 * 読み込んだだけで打刻すると、カードを見せ合ったり戻るボタンで誤打刻が起きるので、
 * 画面で内容を確認してからボタンを1回押す形にしている。
 */
export default async function PunchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const teacher = await prisma.teacher.findUnique({ where: { punchToken: token } });
  if (!teacher || !teacher.active) notFound();

  const date = todayISO();
  const punches = await prisma.punch.findMany({
    where: { teacherId: teacher.id, date },
    orderBy: { inAt: "asc" },
  });
  const open = punches.find((p) => !p.outAt);
  const worked = punches.reduce((s, p) => s + punchMinutes(p.inAt, p.outAt), 0);

  async function doPunch() {
    "use server";
    const t = await prisma.teacher.findUnique({ where: { punchToken: token } });
    if (!t || !t.active) return;
    await punch(t.id);
    revalidatePath(`/p/${token}`);
    revalidatePath("/attendance");
    revalidatePath("/payroll");
    revalidatePath("/");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
          <div className="text-xs text-slate-400">{formatDateJP(date)}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {teacher.name}
          </div>

          <div className="mt-4 mb-5">
            {open ? (
              <div className="bg-emerald-50 text-emerald-800 rounded-lg py-3">
                <div className="text-xs">出勤中</div>
                <div className="text-lg font-bold font-mono">{open.inAt} 〜</div>
              </div>
            ) : (
              <div className="bg-slate-50 text-slate-600 rounded-lg py-3">
                <div className="text-xs">
                  {punches.length > 0 ? "退勤済" : "未出勤"}
                </div>
                <div className="text-lg font-bold">
                  {punches.length > 0 ? `実働 ${formatMinutes(worked)}` : "—"}
                </div>
              </div>
            )}
          </div>

          <form action={doPunch}>
            <button
              type="submit"
              className={`w-full text-white text-lg font-bold py-4 rounded-lg ${
                open
                  ? "bg-slate-700 hover:bg-slate-800"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {open ? "退勤する" : "出勤する"}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-3">
            いま {nowHM()} で記録します
          </p>
        </div>

        {punches.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-[11px] font-medium text-slate-400 mb-1.5">
              今日の記録
            </div>
            <ul className="space-y-1">
              {punches.map((p) => (
                <li
                  key={p.id}
                  className="text-sm font-mono text-slate-700 flex justify-between"
                >
                  <span>
                    {p.inAt} 〜 {p.outAt ?? "（出勤中）"}
                  </span>
                  {p.outAt && (
                    <span className="text-slate-400">
                      {formatMinutes(punchMinutes(p.inAt, p.outAt))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
