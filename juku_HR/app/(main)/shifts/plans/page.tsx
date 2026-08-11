import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlanForm } from "./PlanForm";
import { PLAN_STATUS, PLAN_STATUS_LABEL, formatDateJP } from "@/lib/constants";

export const metadata = { title: "シフト計画｜塾HR" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await prisma.shiftPlan.findMany({
    orderBy: [{ fromDate: "desc" }],
    include: {
      _count: { select: { demands: true, assignments: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">シフト計画</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          対象期間ごとに1つ作ります。必要人数も割当もこの計画にぶら下がります。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">新しい計画</h2>
        <PlanForm />
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">
          まだ計画がありません。上のフォームから作成してください。
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 border-b border-slate-200">
                <th className="text-left font-medium px-4 py-2">名前</th>
                <th className="text-left font-medium px-2 py-2">期間</th>
                <th className="text-right font-medium px-2 py-2 w-24">必要人数</th>
                <th className="text-right font-medium px-2 py-2 w-20">割当</th>
                <th className="text-right font-medium px-4 py-2 w-20">状態</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2">
                    <Link
                      href={`/shifts/plans/${p.id}`}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-500 text-xs">
                    {formatDateJP(p.fromDate)} 〜 {formatDateJP(p.toDate)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                    {p._count.demands === 0 ? (
                      <span className="text-amber-600">未設定</span>
                    ) : (
                      `${p._count.demands}件`
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {p._count.assignments}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={`text-[11px] rounded px-1.5 py-0.5 ${
                        p.status === PLAN_STATUS.CONFIRMED
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {PLAN_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">下書きのうちは講師に見えません。</b>
          検討中のシフトが見えてしまうと、確定していない予定で人が動いてしまいます。
        </p>
        <p>
          <b className="text-slate-700">必要人数は科目ごとに設定します。</b>
          「講師4人」ではなく「英語2人・数学1人」で持ちます。科目を見ずに人数だけ合わせると、
          誰も英語を教えられないシフトができてしまうためです。
        </p>
      </div>
    </div>
  );
}
