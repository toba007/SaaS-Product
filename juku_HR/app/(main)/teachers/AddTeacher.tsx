"use client";

import { useActionState } from "react";
import { addTeacher, type AddState } from "./actions";
import { EMPLOYMENT, EMPLOYMENT_LABEL, ROLE, ROLE_LABEL } from "@/lib/constants";

/**
 * 講師を1人追加する。
 *
 * 入れるのは「名前・ログインID・役割・雇用区分」だけにしてある。
 * 担当科目や給与の単価まで一度に聞くと、それが決まるまで登録が止まる。
 * 先に登録して、各画面で埋めるほうが早い。
 */
export function AddTeacher() {
  const [state, formAction, pending] = useActionState<AddState, FormData>(
    addTeacher,
    {},
  );

  return (
    <section className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-2.5 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900 text-sm">講師を追加</h2>
      </div>

      <form action={formAction} className="p-4 flex flex-wrap items-end gap-3">
        <Field label="名前" hint="例：佐藤 健一">
          <input
            name="name"
            required
            maxLength={40}
            className="w-40 border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </Field>

        <Field label="ふりがな" hint="任意">
          <input
            name="kana"
            maxLength={40}
            className="w-40 border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </Field>

        <Field label="ログインID" hint="英小文字・数字・_ の3〜20文字">
          <input
            name="loginId"
            required
            pattern="[a-zA-Z0-9_]{3,20}"
            maxLength={20}
            autoCapitalize="none"
            autoComplete="off"
            className="w-40 border border-slate-300 rounded px-2 py-1 text-sm font-mono"
          />
        </Field>

        <Field label="役割" hint="管理者は管理画面に入れる">
          <select
            name="role"
            defaultValue={ROLE.TEACHER}
            className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
          >
            {[ROLE.TEACHER, ROLE.ADMIN].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="雇用区分" hint="給与の計算に使う">
          <select
            name="employment"
            defaultValue={EMPLOYMENT.PART_TIME}
            className="w-32 border border-slate-300 rounded px-2 py-1 text-sm"
          >
            {Object.values(EMPLOYMENT).map((e) => (
              <option key={e} value={e}>
                {EMPLOYMENT_LABEL[e]}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "追加中…" : "追加"}
        </button>
      </form>

      {state.error && (
        <p className="mx-4 mb-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      {state.added && (
        <div className="mx-4 mb-4 bg-emerald-50 border border-emerald-200 rounded px-3 py-2.5">
          <div className="text-sm text-emerald-900 font-medium">
            {state.added.name} さんを追加しました
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] text-emerald-700">ログインID</span>
              <div className="font-mono font-bold text-emerald-900 select-all">
                {state.added.loginId}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-emerald-700">
                パスワード（この1回しか表示されません）
              </span>
              <div className="font-mono font-bold text-emerald-900 select-all">
                {state.added.password}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-emerald-800">
            本人に伝えてください。控えを取り損ねたら、下の一覧から再発行できます。
            担当科目・勤務上限・給与の単価は、それぞれの画面で登録してください。
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
      <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>
    </label>
  );
}
