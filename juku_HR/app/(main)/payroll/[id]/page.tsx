import Link from "next/link";
import { notFound } from "next/navigation";
import { computePayslip, payLineDetail, yen } from "@/lib/payroll";
import { PrintButton } from "@/app/components/PrintButton";
import { EMPLOYMENT_LABEL, formatDateJP } from "@/lib/constants";
import { addMonths, formatYm, parseYm } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const teacherId = Number(id);
  if (!Number.isInteger(teacherId)) notFound();

  const ym = parseYm(sp.ym);
  const slip = await computePayslip(teacherId, ym);
  if (!slip) notFound();

  // 交通費は「通常期は定期券あり／講習期間は定期券なし」で単価が変わるので、
  // 明細では日ごとに並べず、期の種別ごとにまとめて見せる。
  const commuteGroups = new Map<string, { days: number; amount: number }>();
  for (const d of slip.commuteDays) {
    const key = d.spot ? "講習期間（定期券なし）" : "通常期（定期券あり）";
    const g = commuteGroups.get(key) ?? { days: 0, amount: 0 };
    g.days += 1;
    g.amount += d.amount;
    commuteGroups.set(key, g);
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/payroll?ym=${formatYm(ym)}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← 給与計算
          </Link>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {slip.name} さんの給与明細
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/payroll/${teacherId}?ym=${formatYm(addMonths(ym, -1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900 tabular-nums w-24 text-center">
            {ym.year}年{ym.month}月
          </span>
          <Link
            href={`/payroll/${teacherId}?ym=${formatYm(addMonths(ym, 1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            →
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="print-area bg-white border border-slate-300 rounded-lg p-6 max-w-2xl mx-auto">
        <div className="text-center border-b-2 border-slate-800 pb-2 mb-4">
          <h2 className="text-lg font-bold tracking-widest text-slate-900">
            給与明細
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {ym.year}年{ym.month}月分
          </p>
        </div>

        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-lg font-bold text-slate-900">{slip.name}</span>
          <span className="text-xs text-slate-500">
            {EMPLOYMENT_LABEL[slip.employment]}
          </span>
        </div>

        <table className="w-full text-sm border border-slate-300 mb-4">
          <tbody>
            {/* 行は賃金項目そのもの。項目は教室ごとに違うので決め打ちしない */}
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
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-800">
              <td className="px-3 py-2.5 font-bold text-slate-900" colSpan={2}>
                支給合計
              </td>
              <td className="px-3 py-2.5 text-right text-lg font-bold text-slate-900 tabular-nums">
                {yen(slip.total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="text-xs text-slate-500 space-y-0.5">
          <p>出勤日数: {slip.workDays}日</p>
          {slip.commuteDays.length > 0 && (
            <p>
              出勤日: {slip.commuteDays.map((d) => formatDateJP(d.date)).join("、")}
            </p>
          )}
        </div>

        <p className="text-[10px] text-slate-400 mt-4 pt-2 border-t border-slate-200">
          この明細は勤怠の実績から自動計算しています。内容に相違がある場合は教室までお知らせください。
        </p>
      </div>

      <p className="no-print text-[11px] text-slate-400 max-w-2xl mx-auto">
        支払い（振込）はこのアプリの範囲外です。計算と明細までを扱います。
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
    <tr className="border-b border-slate-200">
      <th className="text-left bg-slate-50 border-r border-slate-200 px-3 py-2 font-medium text-slate-600 text-xs w-24">
        {label}
      </th>
      <td className="px-3 py-2 text-slate-500 text-xs">{detail}</td>
      <td className="px-3 py-2 text-right text-slate-900 tabular-nums w-28">
        {yen(amount)}
      </td>
    </tr>
  );
}
