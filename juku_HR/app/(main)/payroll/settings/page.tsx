import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { WageForm, type PayItemColumn, type WageFormData } from "./WageForm";
import { gridStyle } from "./grid";
import { EMPLOYMENT_LABEL, PAY_BASIS_UNIT } from "@/lib/constants";

export const metadata = { title: "給与設定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function WageSettingsPage() {
  const [teachers, items] = await Promise.all([
    prisma.teacher.findMany({
      where: { active: true },
      include: { payRates: true },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    // 列は賃金項目そのもの。項目は管理者が作るので、数は塾ごとに違う。
    prisma.payItem.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { id: "asc" }],
    }),
  ]);

  const columns: PayItemColumn[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    basis: i.basis,
  }));

  const rows: WageFormData[] = teachers.map((t) => ({
    teacherId: t.id,
    name: t.name,
    employment: EMPLOYMENT_LABEL[t.employment] ?? t.employment,
    rates: Object.fromEntries(t.payRates.map((r) => [r.payItemId, r.amount])),
  }));

  // 単価が1つも入っていない講師は、給与が0円で出てしまう
  const unset = rows.filter((r) => Object.keys(r.rates).length === 0);

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

      {columns.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          賃金項目がまだありません。
          <Link href="/payroll/items" className="underline mx-1">
            賃金項目
          </Link>
          で先に作ってください
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <div style={{ minWidth: `${16 + columns.length * 7}rem` }}>
            <div
              style={gridStyle(columns.length)}
              className="px-3 py-2 text-[11px] text-slate-400"
            >
              <div className="font-medium">講師</div>
              {columns.map((c) => (
                <div key={c.id} className="font-medium">
                  {c.name}
                  <div className="font-normal text-slate-300">
                    円/{PAY_BASIS_UNIT[c.basis]?.replace("1", "") ?? ""}
                  </div>
                </div>
              ))}
              <div />
            </div>

            {rows.map((r) => (
              <WageForm key={r.teacherId} data={r} items={columns} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">列は賃金項目</b>
          です。項目そのものの追加・変更は
          <Link href="/payroll/items" className="text-indigo-600 hover:underline mx-1">
            賃金項目
          </Link>
          で行います。どの項目を担当したかは
          <Link href="/attendance" className="text-indigo-600 hover:underline mx-1">
            勤怠管理
          </Link>
          で記録します。
        </p>
        <p>
          <b className="text-slate-700">空欄は「未設定」</b>
          で、0円とは違います。その講師に当てはまらない項目は空欄にしてください。
          未設定の項目で担当した実績があると、給与計算の画面で警告が出ます
          （黙って0円で計算すると、設定漏れに気づけないため）。
        </p>
        <p>
          <b className="text-slate-700">月額固定の項目</b>
          は、単価を入れた講師にだけ毎月そのまま付きます。
          役職手当のように、実績の数に関係なく払うものに使ってください。
        </p>
      </div>
    </div>
  );
}
