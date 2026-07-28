import Link from "next/link";
import type { TermKindInfo } from "@/lib/terms";

/**
 * コマタイプのタブ（レギュラー / 夏期講習 / 冬期講習 / 春期講習）。
 * コマの時間帯が期タイプごとに違うので、どの期のシフトを扱っているかをここで切り替える。
 */
export function TermKindTabs({
  tabs,
  current,
  href,
  size = "md",
}: {
  tabs: TermKindInfo[];
  current: string;
  /** タブの行き先を作る。kind を受け取って URL を返す */
  href: (kind: string) => string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <div>
      <div className="text-[11px] font-medium text-slate-400 mb-1">コマタイプ</div>
      <div className="flex gap-1.5">
        {tabs.map((t) => {
          const active = t.kind === current;
          // 期が登録されていない種別は、押しても入れる日が無い
          const empty = t.terms.length === 0;
          return (
            <Link
              key={t.kind}
              href={href(t.kind)}
              title={
                empty
                  ? `${t.label}の期間が登録されていません`
                  : t.terms.map((x) => `${x.startDate}〜${x.endDate}`).join(" / ")
              }
              className={`flex-1 text-center rounded border ${pad} ${
                active
                  ? "bg-emerald-600 border-emerald-600 text-white font-medium"
                  : empty
                    ? "bg-white border-slate-200 text-slate-300"
                    : "bg-white border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
