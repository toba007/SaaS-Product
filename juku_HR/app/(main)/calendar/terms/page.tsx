import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TermForm } from "./TermForm";
import { deleteTerm } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { TERM_KIND, TERM_KIND_LABEL, formatDateJP, todayISO } from "@/lib/constants";

export const metadata = { title: "期間（講習）｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 期（レギュラー／夏期講習など）を登録する画面。
 *
 * これまで seed でしか作れず、画面から足せなかった。
 * ここで決めた期間はカレンダーの背景だけでなく、交通費の単価と
 * 講師のシフト希望のコマタイプにも効くので、独立した画面にしている。
 */
export default async function TermsPage() {
  const terms = await prisma.term.findMany({ orderBy: { startDate: "asc" } });
  const today = todayISO();

  // 期の登録が無い日は「通常期」として扱われる。空白があると気づけるようにする。
  const gaps: { from: string; to: string }[] = [];
  for (let i = 0; i < terms.length - 1; i++) {
    const end = terms[i].endDate;
    const nextStart = terms[i + 1].startDate;
    const dayAfter = new Date(end);
    dayAfter.setDate(dayAfter.getDate() + 1);
    const nextDay = dayAfter.toISOString().slice(0, 10);
    if (nextDay < nextStart) gaps.push({ from: nextDay, to: nextStart });
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/calendar" className="text-sm text-indigo-600 hover:underline">
          ← 塾の予定
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">期間（講習）</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          レギュラー期間と講習期間を登録します。カレンダーの黄色い背景はここで決まります。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600 space-y-1.5">
        <p>
          <b className="text-slate-800">ここで決めた期間が効く先は3つ</b>
          あります。見た目だけの設定ではありません。
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <b>交通費</b> … レギュラー以外は「定期券なし」の日額で計算します
          </li>
          <li>
            <b>講師のシフト希望</b> … 期ごとにコマの時間帯が違うため、入力する画面が変わります
          </li>
          <li>
            <b>カレンダーの背景</b> … 講習期間が黄色く表示されます
          </li>
        </ul>
        <p className="text-slate-400">
          期の登録が無い日は「レギュラー（定期券あり）」として扱われます。
        </p>
      </div>

      {gaps.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          期間の間に空白があります（
          {gaps
            .map((g) => `${formatDateJP(g.from)}〜${formatDateJP(g.to)}の前日`)
            .join("、")}
          ）。その期間はレギュラー扱いになります
        </p>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {terms.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              期間がまだ登録されていません。右のフォームから追加してください
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {terms.map((t) => {
                const current = today >= t.startDate && today <= t.endDate;
                const past = t.endDate < today;
                return (
                  <li
                    key={t.id}
                    className={`px-4 py-2.5 flex items-center gap-3 ${past ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        t.kind === TERM_KIND.REGULAR
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {TERM_KIND_LABEL[t.kind] ?? t.kind}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-900 truncate">
                        {t.name}
                        {current && (
                          <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-50 rounded px-1">
                            今ここ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums">
                        {formatDateJP(t.startDate)} 〜 {formatDateJP(t.endDate)}
                      </div>
                    </div>

                    <form action={deleteTerm}>
                      <input type="hidden" name="id" value={t.id} />
                      <ConfirmSubmit
                        message={`「${t.name}」を削除しますか？ この期間は「レギュラー（定期券あり）」として扱われるようになり、交通費の計算とシフト希望のコマタイプが変わります。`}
                        className="text-[11px] text-slate-400 hover:text-rose-600 shrink-0"
                      >
                        削除
                      </ConfirmSubmit>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">期間を追加</h2>
          </div>
          <TermForm defaultDate={today} />
        </section>
      </div>
    </div>
  );
}
