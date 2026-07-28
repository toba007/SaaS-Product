"use client";

import { useActionState } from "react";
import { addEvent, type EventState } from "./actions";
import { EVENT_KIND, EVENT_KIND_LABEL } from "@/lib/constants";

export function EventForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction, pending] = useActionState<EventState, FormData>(
    addEvent,
    {},
  );

  return (
    <form action={formAction} className="p-3 space-y-2.5">
      <div>
        <div className="text-[11px] font-medium text-slate-400 mb-1">種類</div>
        <div className="flex gap-1">
          {[EVENT_KIND.EVENT, EVENT_KIND.CLOSED].map((k, i) => (
            <label key={k} className="flex-1">
              <input
                type="radio"
                name="kind"
                value={k}
                defaultChecked={i === 0}
                className="peer sr-only"
              />
              <span
                className={`block text-center text-xs px-2 py-1.5 rounded border cursor-pointer border-slate-200 text-slate-600 ${
                  k === EVENT_KIND.CLOSED
                    ? "peer-checked:bg-rose-500 peer-checked:border-rose-500"
                    : "peer-checked:bg-slate-900 peer-checked:border-slate-900"
                } peer-checked:text-white peer-checked:font-medium`}
              >
                {EVENT_KIND_LABEL[k]}
              </span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          休校日にすると、その日は講師がシフトを出せなくなります
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">予定の名前</span>
        <input
          type="text"
          name="title"
          required
          placeholder="例: 全国模試 / お盆休み"
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        />
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
          <span className="text-[11px] font-medium text-slate-400">
            終了日（省略可）
          </span>
          <input
            type="date"
            name="endDate"
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <p className="text-[10px] text-slate-400 -mt-1">
        終了日を空にすると1日だけの予定になります
      </p>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">メモ（省略可）</span>
        <input
          type="text"
          name="note"
          placeholder="例: 教室は9時開場"
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        />
      </label>

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
        {pending ? "追加中…" : "予定を追加"}
      </button>
    </form>
  );
}
