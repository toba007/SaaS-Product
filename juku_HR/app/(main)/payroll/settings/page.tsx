import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GRID, WageForm, type WageFormData } from "./WageForm";
import {
  EMPLOYMENT_LABEL,
  LESSON_STYLE_LABEL,
  LESSON_STYLE_ORDER,
} from "@/lib/constants";

export const metadata = { title: "給与設定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function WageSettingsPage() {
  const teachers = await prisma.teacher.findMany({
    where: { active: true },
    include: { wageRates: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  const rows: WageFormData[] = teachers.map((t) => ({
    teacherId: t.id,
    name: t.name,
    employment: EMPLOYMENT_LABEL[t.employment] ?? t.employment,
    hourlyWage: t.hourlyWage,
    commuteRegular: t.commuteRegular,
    commuteSpot: t.commuteSpot,
    rates: Object.fromEntries(t.wageRates.map((r) => [r.style, r.amount])),
  }));

  // 単価が1つも入っていない講師は、給与が0円で出てしまう
  const unset = rows.filter(
    (r) => LESSON_STYLE_ORDER.every((s) => r.rates[s] === undefined),
  );

  return (
    <div className="space-y-4">
      <div>
        <Link href="/payroll" className="text-sm text-indigo-600 hover:underline">
          ← 給与計算
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">給与設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          ここで決めた単価が、勤怠の実績にかけ算されて給与になります。
        </p>
      </div>

      {unset.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          コマ給が1つも入っていない講師がいます（
          {unset.map((r) => r.name).join("、")}
          ）。このままだとその講師の給与が0円になります。
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div className="min-w-4xl">
          <div className={`${GRID} px-3 py-2 text-[11px] text-slate-400`}>
            <div className="font-medium">講師</div>
            {LESSON_STYLE_ORDER.map((s) => (
              <div key={s} className="font-medium">
                {LESSON_STYLE_LABEL[s]}
                <div className="font-normal text-slate-300">円/コマ</div>
              </div>
            ))}
            <div className="font-medium">
              事務作業
              <div className="font-normal text-slate-300">円/時</div>
            </div>
            <div className="font-medium">
              交通費 通常期
              <div className="font-normal text-slate-300">円/日</div>
            </div>
            <div className="font-medium">
              交通費 講習
              <div className="font-normal text-slate-300">円/日</div>
            </div>
            <div />
          </div>

          {rows.map((r) => (
            <WageForm key={r.teacherId} data={r} />
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">コマ給は授業形態ごと</b>
          です。同じ講師でも、集団を持つ日と個別を持つ日で単価が変わります。
          どの形態を担当したかは
          <Link href="/attendance" className="text-indigo-600 hover:underline mx-1">
            勤怠管理
          </Link>
          で記録します。
        </p>
        <p>
          <b className="text-slate-700">空欄は「未設定」</b>
          で、0円とは違います。担当しない形態は空欄にしてください。
          未設定の形態を担当した実績があると、給与計算の画面で警告が出ます
          （黙って0円で計算すると、設定漏れに気づけないため）。
        </p>
        <p>
          <b className="text-slate-700">交通費は日額</b>
          です。通常期は定期券がある前提なので0円のことが多く、
          定期券の無い講習期間だけ実費、という使い方を想定しています。
        </p>
      </div>
    </div>
  );
}
