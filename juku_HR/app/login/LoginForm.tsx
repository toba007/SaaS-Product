"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded hover:bg-indigo-700 disabled:opacity-60"
    >
      {pending ? "確認しています…" : "ログイン"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="text-xs font-medium text-slate-600">ID</span>
        <input
          type="text"
          name="loginId"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">パスワード</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
