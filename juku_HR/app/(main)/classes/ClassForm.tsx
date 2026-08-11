"use client";

import { useActionState } from "react";
import { createClassGroup, type ClassState } from "./actions";

/** クラスを1つ作るフォーム。エラーを出すためにクライアント側に置く。 */
export function ClassForm({
  grades,
  subjects,
  periods,
  weekdays,
  levels,
  defaultGrade,
  defaultSubjectId,
  defaultFrom,
  defaultTo,
}: {
  grades: readonly string[];
  subjects: { id: number; name: string }[];
  periods: { id: number; label: string }[];
  weekdays: string[];
  levels: { value: number; label: string }[];
  defaultGrade: string;
  defaultSubjectId: number;
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, action, pending] = useActionState<ClassState, FormData>(
    createClassGroup,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">
        学年
        <select
          name="grade"
          defaultValue={defaultGrade}
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        >
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        科目
        <select
          name="subjectId"
          defaultValue={defaultSubjectId}
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        レベル
        <select
          name="level"
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        >
          {levels.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        曜日
        <select
          name="dayOfWeek"
          defaultValue={2}
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        >
          {weekdays.map((w, i) => (
            <option key={i} value={i}>
              {w}
            </option>
          ))}
        </select>
      </label>
      {/* 「月曜は英英数」のように同じ日に何コマも入るので、複数選べるようにする */}
      <fieldset className="text-xs text-slate-500">
        <legend>コマ（複数可）</legend>
        <div className="mt-0.5 flex flex-wrap gap-2 border border-slate-200 rounded px-2 py-1.5">
          {periods.map((p) => (
            <label key={p.id} className="flex items-center gap-1 text-sm text-slate-900">
              <input type="checkbox" name="periodIds" value={p.id} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs text-slate-500">
        定員
        <input
          type="number"
          name="capacity"
          min={0}
          max={99}
          defaultValue={0}
          title="0 なら上限なし"
          className="block mt-0.5 w-16 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="text-xs text-slate-500">
        開始
        <input
          type="date"
          name="fromDate"
          defaultValue={defaultFrom}
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <label className="text-xs text-slate-500">
        終了
        <input
          type="date"
          name="toDate"
          defaultValue={defaultTo}
          className="block mt-0.5 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "作成中…" : "クラスを作る"}
      </button>
      {state.error && <p className="w-full text-sm text-rose-700">{state.error}</p>}
    </form>
  );
}
