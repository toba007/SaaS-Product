import Link from "next/link";
import {
  computeAllPayslips,
  formatMinutes,
  payslipNoticeSentAt,
  yen,
  type PayLine,
} from "@/lib/payroll";
import { notifyPayslips } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import {
  EMPLOYMENT_LABEL,
  PAY_BASIS,
  formatDateJP,
  lessonStyleLabel,
  todayISO,
} from "@/lib/constants";
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
  // 明細ができたことを、もう知らせてあるか
  const noticeSentAt = await payslipNoticeSentAt(ym);

  const total = slips.reduce((s, p) => s + p.total, 0);
  const totalLessons = slips.reduce((s, p) => s + p.slotCount, 0);
  const totalAdmin = slips.reduce((s, p) => s + p.hourMinutes, 0);
  const totalCommute = slips.reduce((s, p) => s + p.dailyPay, 0);
  const paid = slips.filter((p) => p.total > 0);
  // 単価が入っていない形態で働いた実績がある人。金額が過少に出てしまう。
  const unrated = slips.filter((p) => p.unratedCount > 0);
  // どの項目にも紐づかない実績。単価未設定より重い（0円ですらなく、明細に出ない）。
  const orphans = slips.filter((p) => p.orphanSlots > 0 || p.orphanMinutes > 0);

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
            href="/payroll/items"
            className="ml-1 px-3 py-1.5 text-sm border border-slate-300 bg-white rounded hover:bg-slate-50"
          >
            賃金項目
          </Link>
          <Link
            href="/payroll/settings"
            className="px-3 py-1.5 text-sm border border-slate-300 bg-white rounded hover:bg-slate-50"
          >
            給与設定
          </Link>
        </div>
      </div>

      {orphans.length > 0 && (
        <p className="text-sm text-rose-900 bg-rose-50 border-2 border-rose-300 rounded-lg px-3 py-2">
          <b>どの賃金項目にも入らない実績があります。</b>
          そのぶんは給与にまったく計上されていません（
          {orphans
            .map(
              (p) =>
                `${p.name} ${p.orphanSlots > 0 ? `${p.orphanSlots}コマ` : ""}${
                  p.orphanStyles.length > 0
                    ? `（${p.orphanStyles.map(lessonStyleLabel).join("・")}）`
                    : ""
                }${p.orphanMinutes > 0 ? ` 事務${formatMinutes(p.orphanMinutes)}` : ""}`,
            )
            .join("、")}
          ）。
          <Link href="/payroll/items" className="underline mx-1">
            賃金項目
          </Link>
          に対応する項目を作ってください。
        </p>
      )}

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

      {/*
        明細は講師の画面でいつでも見られるが、出たことに気づく手段が無い。
        出るのを待って毎日開く人はいないので、こちらから知らせる。
      */}
      {paid.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900">
              明細ができたことを講師に知らせる
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              支給のある{paid.length}名に連絡が届き、講師の画面に未読が付きます。
              金額は本文に入りません（各自の明細で見てもらいます）
              {noticeSentAt && (
                <span className="text-slate-400">
                  ／ {formatDateJP(todayISO(noticeSentAt))}に送信済み
                </span>
              )}
            </p>
          </div>
          <form action={notifyPayslips}>
            <input type="hidden" name="ym" value={formatYm(ym)} />
            <ConfirmSubmit
              message={
                noticeSentAt
                  ? `この月の通知はすでに送信済みです。もう一度 ${paid.length}名に送りますか？`
                  : `${ym.year}年${ym.month}月分の明細ができたことを、${paid.length}名に知らせますか？`
              }
              className={`px-3 py-1.5 text-sm rounded font-medium ${
                noticeSentAt
                  ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {noticeSentAt ? "もう一度知らせる" : "講師に知らせる"}
            </ConfirmSubmit>
          </form>
        </div>
      )}

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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium px-4 py-2">講師</th>
              <th className="text-left font-medium px-2 py-2">内訳</th>
              <th className="text-right font-medium px-2 py-2">コマ数</th>
              <th className="text-right font-medium px-2 py-2">出勤</th>
              <th className="text-right font-medium px-4 py-2">支給合計</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((p) => (
              <tr key={p.teacherId} className="border-b border-slate-100 hover:bg-slate-50 align-top">
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
                {/* 項目は教室ごとに数が違うので、列にはできない。1セルに縦に並べる */}
                <td className="px-2 py-2 text-[11px] text-slate-500 space-y-0.5">
                  {p.lines.length === 0
                    ? "—"
                    : p.lines.map((l) => (
                        <div key={l.itemId} className="flex gap-1.5">
                          <span className="text-slate-700">{l.name}</span>
                          <span className="text-slate-400 tabular-nums">
                            {quantityText(l)}
                            {l.rate === null ? (
                              <span className="text-rose-600 font-medium ml-1">
                                単価未設定
                              </span>
                            ) : (
                              ` × ${yen(l.rate)}`
                            )}
                          </span>
                          <span className="ml-auto tabular-nums text-slate-700">
                            {yen(l.amount)}
                          </span>
                        </div>
                      ))}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                  {p.slotCount}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                  {p.workDays}日
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
              <td className="px-2 py-2 text-right text-xs text-slate-400">
                事務作業 {formatMinutes(totalAdmin)}／日額 {yen(totalCommute)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium">
                {totalLessons}
              </td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">
                {yen(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        金額は賃金項目ごとに「数量 × 単価」で計算します。時間で払う項目は、
        月の合計分から1回だけ計算し端数を四捨五入します（1件ずつ丸めると誤差が積もるため）。
        項目そのものは
        <Link href="/payroll/items" className="underline mx-1">賃金項目</Link>
        で追加・変更できます。
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

/** 数量を項目の計算方法に合わせて読める形にする */
function quantityText(l: PayLine): string {
  if (l.basis === PAY_BASIS.PER_HOUR) return formatMinutes(l.quantity);
  if (l.basis === PAY_BASIS.PER_DAY) return `${l.quantity}日`;
  if (l.basis === PAY_BASIS.MONTHLY) return "月額";
  return `${l.quantity}コマ`;
}
