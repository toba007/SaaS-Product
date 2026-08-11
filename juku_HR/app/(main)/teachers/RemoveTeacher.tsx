"use client";

import { useActionState } from "react";
import {
  deleteTeacher,
  restoreTeacher,
  retireTeacher,
  type RemoveState,
} from "./actions";

/**
 * 講師を在籍から外す。
 *
 * **記録がある講師は「退職」にするだけで、行は消さない。**
 * 過去のシフト・勤怠・給与がぶら下がっているので、消すと締めた月の給与が
 * 計算し直せなくなる。完全に消せるのは、記録が1件も無い講師だけ
 * （登録を間違えたときの取り消し）。
 */
export function RemoveTeacher({
  teacherId,
  name,
  records,
  isSelf,
}: {
  teacherId: number;
  name: string;
  /** ぶら下がっている記録の件数。0 のときだけ完全削除を出す。 */
  records: number;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState<RemoveState, FormData>(
    records === 0 ? deleteTeacher : retireTeacher,
    {},
  );

  if (isSelf) {
    return (
      <span className="text-[10px] text-slate-300" title="自分を外すと管理画面に入れなくなります">
        —
      </span>
    );
  }

  const label = records === 0 ? "削除" : "退職にする";
  const confirmText =
    records === 0
      ? `${name} さんを削除しますか？ まだ記録が無いので完全に消えます。`
      : `${name} さんを退職にしますか？\n\n記録（${records}件）は残ります。一覧から外れ、シフトの割当対象ではなくなります。あとで在籍に戻せます。`;

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm(confirmText)) e.preventDefault();
        }}
      >
        <input type="hidden" name="teacherId" value={teacherId} />
        <button
          type="submit"
          disabled={pending}
          title={
            records === 0
              ? "記録が無いので完全に削除できます"
              : `記録が${records}件あるため、退職にします（消えません）`
          }
          className="text-xs text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50"
        >
          {pending ? "処理中…" : label}
        </button>
      </form>
      {state.error && (
        <p className="mt-1 text-[10px] text-rose-700">{state.error}</p>
      )}
    </div>
  );
}

/** 退職を取り消して在籍に戻す */
export function RestoreTeacher({
  teacherId,
  name,
}: {
  teacherId: number;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<RemoveState, FormData>(
    restoreTeacher,
    {},
  );

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm(`${name} さんを在籍に戻しますか？`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="teacherId" value={teacherId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-slate-500 hover:text-indigo-600 hover:underline disabled:opacity-50"
        >
          {pending ? "処理中…" : "在籍に戻す"}
        </button>
      </form>
      {state.error && (
        <p className="mt-1 text-[10px] text-rose-700">{state.error}</p>
      )}
    </div>
  );
}
