"use client";

import { useActionState } from "react";
import { saveWages, type SaveState } from "./actions";
import { LESSON_STYLE_LABEL, LESSON_STYLE_ORDER } from "@/lib/constants";

/**
 * 1行ぶんの給与設定。
 *
 * table を使っていないのは、講師ごとに form を分ける必要があるため。
 * HTML では <tr> の直下に <form> を置けず（<form> の直下に <td> も置けず）、
 * ブラウザのパーサーが form を取り除いてしまうので、サーバーが描いた DOM と
 * 食い違ってハイドレーションが壊れる。grid で同じ見た目にしている。
 */
export const GRID = "grid grid-cols-[10rem_repeat(6,6.5rem)_6rem] gap-2 items-center";

export type WageFormData = {
  teacherId: number;
  name: string;
  employment: string;
  hourlyWage: number;
  commuteRegular: number;
  commuteSpot: number;
  /** style -> 円。未設定の形態は入っていない */
  rates: Record<string, number>;
};

export function WageForm({ data }: { data: WageFormData }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    saveWages,
    {},
  );
  const saved = state.savedId === data.teacherId;

  return (
    <form action={formAction} className={`${GRID} px-3 py-2 border-t border-slate-100`}>
      <input type="hidden" name="teacherId" value={data.teacherId} />

      <div className="min-w-0">
        <div className="text-sm text-slate-900 truncate">{data.name}</div>
        <div className="text-[10px] text-slate-400">{data.employment}</div>
      </div>

      {LESSON_STYLE_ORDER.map((style) => (
        <Yen
          key={style}
          name={`rate_${style}`}
          defaultValue={data.rates[style]}
          title={`${data.name} の${LESSON_STYLE_LABEL[style]}のコマ給`}
        />
      ))}

      <Yen name="hourlyWage" defaultValue={data.hourlyWage} title="事務作業の時給" />
      <Yen
        name="commuteRegular"
        defaultValue={data.commuteRegular}
        title="通常期の交通費（定期券があるなら0）"
      />
      <Yen
        name="commuteSpot"
        defaultValue={data.commuteSpot}
        title="講習期間の交通費（定期券なし）"
      />

      <div className="flex items-center justify-end gap-1.5">
        {saved && <span className="text-[10px] text-emerald-600">保存済</span>}
        {state.error && (
          <span className="text-[10px] text-rose-600">{state.error}</span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="text-xs bg-indigo-600 text-white font-medium px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "…" : "保存"}
        </button>
      </div>
    </form>
  );
}

function Yen({
  name,
  defaultValue,
  title,
}: {
  name: string;
  defaultValue: number | undefined;
  title: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 pointer-events-none">
        ¥
      </span>
      <input
        type="number"
        name={name}
        min="0"
        step="10"
        title={title}
        defaultValue={defaultValue ?? ""}
        placeholder="—"
        className="w-full border border-slate-200 rounded pl-4 pr-1.5 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}
