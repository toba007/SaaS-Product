import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AddItemForm, GRID, ItemRow, type ItemData } from "./ItemRow";
import { PAY_BASIS, PAY_SOURCE } from "@/lib/constants";

export const metadata = { title: "賃金項目｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 給与明細に並ぶ項目を、管理者が自由に作る画面。
 * 項目の種類も数も塾ごとに違うので、決め打ちにせずマスタとして持つ。
 */
export default async function PayItemsPage() {
  const items = await prisma.payItem.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { rates: true, duties: true, adminWorks: true } },
    },
  });

  const rows: ItemData[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    basis: i.basis,
    source: i.source,
    order: i.order,
    active: i.active,
    rateCount: i._count.rates,
    usedCount: i._count.duties + i._count.adminWorks,
  }));

  // 事務作業の受け皿が無いと、項目を選ばずに記録した事務作業がどこにも入らない
  const hasAdminSink = items.some(
    (i) => i.active && i.basis === PAY_BASIS.PER_HOUR && i.source === PAY_SOURCE.ADMIN,
  );
  // 交通費の項目が無いと、出勤日数に応じた支給が出ない
  const dayItems = items.filter((i) => i.active && i.basis === PAY_BASIS.PER_DAY);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/payroll" className="text-sm text-indigo-600 hover:underline">
          ← 給与計算
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">賃金項目</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          給与明細に並ぶ項目です。名前も数も自由に決められます。
          単価は講師ごとに
          <Link href="/payroll/settings" className="underline mx-1">
            給与設定
          </Link>
          で入れます。
        </p>
      </div>

      {!hasAdminSink && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          「項目を選んでいない事務作業をここに入れる」にした項目がありません。
          このままだと、勤怠で入れた事務作業の時間が給与に反映されません。
        </p>
      )}
      {dayItems.length === 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          出勤日数で払う項目（交通費など）がありません。
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div
          className={`${GRID} px-3 py-2 text-[11px] text-slate-400 border-b border-slate-200 min-w-3xl`}
        >
          <div>項目名</div>
          <div>計算方法</div>
          <div>数量の取り方</div>
          <div>並び順</div>
          <div>使う</div>
          <div />
        </div>

        <div className="min-w-3xl">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              項目がありません。下から追加してください
            </p>
          ) : (
            rows.map((r) => <ItemRow key={r.id} data={r} />)
          )}
          <AddItemForm />
        </div>
      </div>

      <div className="text-[11px] text-slate-400 space-y-1">
        <p>
          <span className="font-medium text-slate-500">コマ数 × 単価</span>
          … 勤怠で担当コマを記録したときに、この項目を選びます。
          「集団授業」「個別1対2」「模試監督」のように、いくつでも作れます。
        </p>
        <p>
          <span className="font-medium text-slate-500">時間 × 単価</span>
          … 事務作業などの記録した時間ぶん。端数は月の合計分から1回だけ四捨五入します。
        </p>
        <p>
          <span className="font-medium text-slate-500">出勤日数 × 単価</span>
          … 出勤した日ごと。通常期（定期券あり）と講習期間（定期券なし）で分けられます。
        </p>
        <p>
          <span className="font-medium text-slate-500">月額固定</span>
          … 単価を入れた講師に毎月そのまま付きます。役職手当など。
        </p>
        <p className="pt-1">
          使われている項目は削除せず「使わない」に切り替わります。
          消してしまうと過去の明細の金額が変わるためです。
        </p>
      </div>
    </div>
  );
}
