"use client";

import { useActionState } from "react";
import { resetPassword, type ResetState } from "./actions";

export function ResetPassword({
  teacherId,
  name,
}: {
  teacherId: number;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    {},
  );

  const issued = state.teacherId === teacherId ? state.password : undefined;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="teacherId" value={teacherId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-slate-500 hover:text-indigo-600 hover:underline disabled:opacity-50"
        >
          {pending ? "発行中…" : "パスワードを再発行"}
        </button>
      </form>

      {issued && (
        <div className="mt-1.5 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
          <div className="text-[10px] text-emerald-800">
            {name} さんの新しいパスワード（この1回しか表示されません）
          </div>
          <div className="font-mono font-bold text-emerald-900 select-all">
            {issued}
          </div>
        </div>
      )}
    </div>
  );
}
