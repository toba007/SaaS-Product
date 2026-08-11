"use client";

import { useActionState } from "react";
import { createShiftPlan, type PlanState } from "./actions";

/**
 * 計画を作るフォーム。
 * エラーを出すために状態を持つので、ここだけクライアント側になる。
 */
export function PlanForm() {
  const [state, action, pending] = useActionState<PlanState, FormData>(
    createShiftPlan,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">
        名前
        <input
          name="name"
          required
          placeholder="2026年9月"
          className="block mt-0.5 w-40 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="text-xs text-slate-500">
        開始日
        <input
          type="date"
          name="fromDate"
          required
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="text-xs text-slate-500">
        終了日
        <input
          type="date"
          name="toDate"
          required
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "作成中…" : "作成"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
