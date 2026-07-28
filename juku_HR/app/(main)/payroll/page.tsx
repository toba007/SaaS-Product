import Link from "next/link";
import { computeAllPayslips, formatMinutes, yen } from "@/lib/payroll";
import { EMPLOYMENT_LABEL, LESSON_STYLE_SHORT } from "@/lib/constants";
import { addMonths, formatYm, parseYm } from "@/lib/dates";

export const metadata = { title: "給与計算｜塾HR" };
export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const sp = await searchParams;
  const ym = parseYm(sp.ym);
  const slips = await computeAllPayslips(ym);

  const total = slips.reduce((s, p) => s + p.total, 0);
  const totalLessons = slips.reduce((s, p) => s + p.lessonCount, 0);
  const totalAdmin = slips.reduce((s, p) => s + p.adminMinutes, 0);
  const totalCommute = slips.reduce((s, p) => s + p.commutePay, 0);
  const paid = slips.filter((p) => p.total > 0);
  // 単価が入っていない形態で働いた実績がある人。金額が過少に出てしまう。
  const unrated = slips.filter((p) => p.unratedCount > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">給与計算</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            勤怠の実績から自動で計算します。支払いは範囲外です。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/payroll?ym=${formatYm(addMonths(ym, -1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-slate-900 tabular-nums w-24 text-center">
            {ym.year}年{ym.month}月
          </span>
          <Link
            href={`/payroll?ym=${formatYm(addMonths(ym, 1))}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            →
          </Link>
          <Link
            href="/payroll/settings"
            className="ml-1 px-3 py-1.5 text-sm border border-slate-300 bg-white rounded hover:bg-slate-50"
          >
            給与設定
          </Link>
        </div>
      </div>

      {unrated.length > 0 && (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          単価が設定されていない授業形態で担当した実績があります（
          {unrated.map((p) => `${p.name} ${p.unratedCount}コマ`).join("、")}
          ）。そのぶんは0円で計算されているので、
          <Link href="/payroll/settings" className="underline mx-1">
            給与設定
          </Link>
          で単価を入れてください。
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="支給合計" value={yen(total)} sub={`${paid.length}名`} big />
        <Stat label="担当コマ" value={`${totalLessons}`} sub="コマ" />
        <Stat label="事務作業" value={formatMinutes(totalAdmin)} sub="" />
        <Stat label="交通費" value={yen(totalCommute)} sub="" />
      </div>

      {total === 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          この月の勤怠実績がまだありません。
          <Link href="/attendance" className="underline ml-1">
            勤怠管理
          </Link>
          でコマの実績を入れると、ここに反映されます。
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-3xl">
          <thead>
            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium px-4 py-2">講師</th>
              <th className="text-right font-medium px-2 py-2">コマ数</th>
              <th className="text-left font-medium px-2 py-2">内訳</th>
              <th className="text-right font-medium px-2 py-2">コマ給</th>
              <th className="text-right font-medium px-2 py-2">事務作業</th>
              <th className="text-right font-medium px-2 py-2">事務時給</th>
              <th className="text-right font-medium px-2 py-2">事務ぶん</th>
              <th className="text-right font-medium px-2 py-2">出勤</th>
              <th className="text-right font-medium px-2 py-2">交通費</th>
              <th className="text-right font-medium px-4 py-2">支給合計</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((p) => (
              <tr key={p.teacherId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/payroll/${p.teacherId}?ym=${formatYm(ym)}`}
                    className="text-slate-900 hover:text-indigo-600 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <div className="text-[10px] text-slate-400">
                    {EMPLOYMENT_LABEL[p.employment]}
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                  {p.lessonCount}
                </td>
                <td className="px-2 py-2 text-[10px] text-slate-400 whitespace-nowrap">
                  {p.styleLines.length === 0
                    ? "—"
                    : p.styleLines.map((l) => (
                        <div key={l.style}>
                          {LESSON_STYLE_SHORT[l.style]} {l.count}×
                          {l.rate === null ? (
                            <span className="text-rose-600 font-medium">単価未設定</span>
                          ) : (
                            yen(l.rate)
                          )}
                        </div>
                      ))}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                  {yen(p.lessonPay)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {p.adminMinutes > 0 ? formatMinutes(p.adminMinutes) : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-400">
                  {yen(p.hourlyWage)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                  {p.adminPay > 0 ? yen(p.adminPay) : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {p.workDays}日
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                  {yen(p.commutePay)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">
                  {yen(p.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className="px-4 py-2 text-xs font-medium text-slate-500">合計</td>
              <td className="px-2 py-2 text-right tabular-nums font-medium">
                {totalLessons}
              </td>
              <td />
              <td className="px-2 py-2 text-right tabular-nums font-medium">
                {yen(slips.reduce((s, p) => s + p.lessonPay, 0))}
              </td>
              <td colSpan={2} className="px-2 py-2 text-right text-xs text-slate-400">
                {formatMinutes(totalAdmin)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium">
                {yen(slips.reduce((s, p) => s + p.adminPay, 0))}
              </td>
              <td />
              <td className="px-2 py-2 text-right tabular-nums font-medium">
                {yen(totalCommute)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">
                {yen(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        コマ給＝担当コマ数×コマ単価。事務ぶん＝事務作業の合計時間×時給（月の合計分から1回だけ計算し、端数は四捨五入）。
        交通費＝出勤日ごとに支給。通常期は定期券あり・講習期間は定期券なしの単価を使います。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: string;
  sub: string;
  big?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-slate-900">
        <span className={`font-bold tabular-nums ${big ? "text-2xl" : "text-xl"}`}>
          {value}
        </span>
        {sub && <span className="text-xs ml-1 text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
