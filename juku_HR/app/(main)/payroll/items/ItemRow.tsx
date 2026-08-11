"use client";

import { useState } from "react";
import { useActionState } from "react";
import { addPayItem, deletePayItem, updatePayItem, type ItemState } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import {
  PAY_BASIS,
  PAY_BASIS_LABEL,
  PAY_BASIS_ORDER,
  PAY_SOURCE,
  PAY_SOURCE_LABEL,
} from "@/lib/constants";

/**
 * table を使わず grid で組んでいるのは、講師別の給与設定と同じ理由。
 * HTML では <tr> の直下に <form> を置けず、ブラウザが form を取り除いてしまう。
 */
export const GRID =
  "grid grid-cols-[1fr_11rem_14rem_4.5rem_5rem_5rem] gap-2 items-center";

export type ItemData = {
  id: number;
  name: string;
  basis: string;
  source: string;
  order: number;
  active: boolean;
  /** 単価を入れている講師の人数。消してよいかの判断に使う */
  rateCount: number;
  /** この項目で記録された実績の件数 */
  usedCount: number;
};

/** 計算方法によって、数量の取り方を選ぶ必要があるかが変わる */
function SourceSelect({
  basis,
  value,
  name = "source",
}: {
  basis: string;
  value: string;
  name?: string;
}) {
  if (basis === PAY_BASIS.PER_DAY) {
    return (
      <select
        name={name}
        defaultValue={value || PAY_SOURCE.REGULAR}
        className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs"
      >
        <option value={PAY_SOURCE.REGULAR}>
          {PAY_SOURCE_LABEL[PAY_SOURCE.REGULAR]}
        </option>
        <option value={PAY_SOURCE.SPOT}>{PAY_SOURCE_LABEL[PAY_SOURCE.SPOT]}</option>
      </select>
    );
  }
  if (basis === PAY_BASIS.PER_HOUR) {
    return (
      <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <input
          type="checkbox"
          name={name}
          value={PAY_SOURCE.ADMIN}
          defaultChecked={value === PAY_SOURCE.ADMIN}
          className="rounded border-slate-300"
        />
        項目を選んでいない事務作業をここに入れる
      </label>
    );
  }
  return (
    <>
      <input type="hidden" name={name} value="" />
      <span className="text-[11px] text-slate-400">
        実績を記録するときにこの項目を選びます
      </span>
    </>
  );
}

export function ItemRow({ data }: { data: ItemData }) {
  const [basis, setBasis] = useState(data.basis);

  return (
    <form
      action={updatePayItem}
      className={`${GRID} px-3 py-2 border-t border-slate-100 ${
        data.active ? "" : "bg-slate-50 opacity-60"
      }`}
    >
      <input type="hidden" name="id" value={data.id} />

      <input
        type="text"
        name="name"
        defaultValue={data.name}
        required
        className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
      />

      <select
        name="basis"
        defaultValue={data.basis}
        onChange={(e) => setBasis(e.target.value)}
        className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs"
      >
        {PAY_BASIS_ORDER.map((b) => (
          <option key={b} value={b}>
            {PAY_BASIS_LABEL[b]}
          </option>
        ))}
      </select>

      <div className="min-w-0">
        <SourceSelect basis={basis} value={data.source} />
      </div>

      <input
        type="number"
        name="order"
        defaultValue={data.order}
        title="明細に出る順番"
        className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm tabular-nums"
      />

      <label className="flex items-center gap-1 text-[11px] text-slate-600">
        <input
          type="checkbox"
          name="active"
          defaultChecked={data.active}
          className="rounded border-slate-300"
        />
        使う
      </label>

      <div className="flex items-center gap-2 justify-end">
        <button
          type="submit"
          className="px-2 py-1 text-xs rounded bg-slate-900 text-white"
        >
          保存
        </button>
        <ConfirmSubmit
          formAction={deletePayItem}
          message={
            data.rateCount + data.usedCount > 0
              ? `「${data.name}」は単価${data.rateCount}件・実績${data.usedCount}件で使われています。過去の明細が変わってしまうので削除はせず、「使わない」に切り替えます。よろしいですか？`
              : `「${data.name}」を削除しますか？`
          }
          className="text-[11px] text-slate-400 hover:text-rose-600"
        >
          削除
        </ConfirmSubmit>
      </div>
    </form>
  );
}

export function AddItemForm() {
  const [basis, setBasis] = useState<string>(PAY_BASIS.PER_SLOT);
  const [state, formAction, pending] = useActionState<ItemState, FormData>(
    addPayItem,
    {},
  );

  return (
    <form action={formAction} className={`${GRID} px-3 py-3 bg-slate-50`}>
      <input
        type="text"
        name="name"
        required
        placeholder="例: 模試監督 / 役職手当"
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
      />

      <select
        name="basis"
        value={basis}
        onChange={(e) => setBasis(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
      >
        {PAY_BASIS_ORDER.map((b) => (
          <option key={b} value={b}>
            {PAY_BASIS_LABEL[b]}
          </option>
        ))}
      </select>

      <div className="min-w-0">
        <SourceSelect basis={basis} value="" />
      </div>

      <input
        type="number"
        name="order"
        defaultValue={99}
        title="明細に出る順番"
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm tabular-nums"
      />

      <span />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded bg-indigo-600 text-white font-medium disabled:opacity-50"
        >
          {pending ? "追加中…" : "項目を追加"}
        </button>
      </div>

      {state.error && (
        <p className="col-span-6 text-xs text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
