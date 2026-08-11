"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTerm, type TermState } from "./actions";
// lib/terms.ts は prisma を読むのでクライアントからは使えない。
// 種類の一覧は定数側（lib/constants.ts）から取る。
import { TERM_KIND_LABEL, TERM_KIND_ORDER } from "@/lib/constants";

export function TermForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction, pending] = useActionState<TermState, FormData>(
    addTerm,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={formAction} className="p-3 space-y-2.5">
      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">期の名前</span>
        <input
          type="text"
          name="name"
          required
          placeholder="例: 2027年 夏期講習"
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">種類</span>
        <select
          name="kind"
          defaultValue="SUMMER"
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        >
          {TERM_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {TERM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-slate-400">
          レギュラー以外は「定期券なし」として交通費を計算します
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">開始日</span>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={defaultDate}
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">終了日</span>
          <input
            type="date"
            name="endDate"
            required
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {state.error && (
        <p
          role="alert"
          className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "追加中…" : "期間を追加"}
      </button>
    </form>
  );
}
