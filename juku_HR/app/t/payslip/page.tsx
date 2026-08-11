import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/dal";
import { computePayslip, payLineDetail, yen } from "@/lib/payroll";
import { formatDateJP } from "@/lib/constants";
import { addMonths, formatYm, parseYm } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function MyPayslipPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const sp = await searchParams;
  const teacher = await requireAuth("/t/payslip");

  const ym = parseYm(sp.ym);
  // 自分のぶんしか計算しない
  const slip = await computePayslip(teacher.id, ym);
  if (!slip) notFound();

  const commuteGroups = new Map<string, { days: number; amount: number }>();
  for (const d of slip.commuteDays) {
    const key = d.spot ? "講習期間（定期券なし）" : "通常期（定期券あり）";
    const g = commuteGroups.get(key) ?? { days: 0, amount: 0 };
    g.days += 1;
    g.amount += d.amount;
    commuteGroups.set(key, g);
  }

  const base = "/t/payslip";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-900">給与明細</h1>
        <div className="flex items-center gap-1">
          <Link
            href={`${base}?ym=${formatYm(addMonths(ym, -1))}`}
            className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 bg-white rounded"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900 tabular-nums w-20 text-center">
            {ym.year}年{ym.month}月
          </span>
          <Link
            href={`${base}?ym=${formatYm(addMonths(ym, 1))}`}
            className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 bg-white rounded"
          >
            →
          </Link>
        </div>
      </div>

      {/* 支給額 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
        <div className="text-[11px] text-slate-500">
          {ym.year}年{ym.month}月分の支給合計
        </div>
        <div className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
          {yen(slip.total)}
        </div>
        {slip.total === 0 && (
          <p className="text-[11px] text-slate-400 mt-1">
            この月の勤務実績はまだありません
          </p>
        )}
      </div>

      {/* 内訳 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-3 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">内訳</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {slip.lines.length === 0 ? (
            <Row label="実績" detail="この月の実績はありません" amount={0} />
          ) : (
            slip.lines.map((l) => (
              <Row
                key={l.itemId}
                label={l.name}
                detail={payLineDetail(l)}
                amount={l.amount}
              />
            ))
          )}
        </ul>
        <div className="px-3 py-2.5 border-t-2 border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">支給合計</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">
            {yen(slip.total)}
          </span>
        </div>
      </section>

      {/* 勤務実績 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-3 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">勤務実績</h2>
          <p className="text-[11px] text-slate-500">出勤 {slip.workDays}日</p>
        </div>
        {slip.commuteDays.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            記録がありません
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {slip.commuteDays.map((d) => (
              <li
                key={d.date}
                className="px-3 py-1.5 flex items-center gap-2 text-xs"
              >
                <span className="text-slate-700 w-20">{formatDateJP(d.date)}</span>
                {d.spot && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 rounded px-1">
                    講習
                  </span>
                )}
                <span className="ml-auto text-slate-500 tabular-nums">
                  交通費 {yen(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-slate-400 px-1">
        勤怠の記録から自動で計算しています。内容に相違がある場合は教室までお知らせください。
      </p>
    </div>
  );
}

function Row({
  label,
  detail,
  amount,
}: {
  label: string;
  detail: string;
  amount: number;
}) {
  return (
    <li className="px-3 py-2 flex items-baseline gap-2">
      <span className="text-sm text-slate-700 w-16 shrink-0">{label}</span>
      <span className="text-[11px] text-slate-400 truncate">{detail}</span>
      <span className="ml-auto text-sm text-slate-900 tabular-nums shrink-0">
        {yen(amount)}
      </span>
    </li>
  );
}
