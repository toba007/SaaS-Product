"use client";

import { useActionState, useEffect, useState } from "react";
import { addEvent, type EventState } from "./actions";
import { EVENT_KIND, EVENT_KIND_LABEL } from "@/lib/constants";
import { REPEAT, REPEAT_LABEL, REPEAT_ORDER } from "@/lib/recurrence";
import { shiftDays } from "@/lib/dates";

export function EventForm({
  defaultDate,
  defaultEndDate,
  defaultStartTime,
  defaultEndTime,
  onDone,
}: {
  defaultDate: string;
  /** ドラッグで期間を選んだときに入る最終日 */
  defaultEndDate?: string;
  /** 時間軸の上でなぞったときに入る時刻。無ければ終日として開く */
  defaultStartTime?: string;
  defaultEndTime?: string;
  /** 追加が通ったときに呼ぶ。ダイアログから使うときに閉じるため。 */
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<EventState, FormData>(
    addEvent,
    {},
  );
  const [repeat, setRepeat] = useState<string>(REPEAT.NONE);
  const [kind, setKind] = useState<string>(EVENT_KIND.EVENT);
  // 時刻を渡されたときだけ時間つき。それ以外は終日で開く
  const [allDay, setAllDay] = useState(!defaultStartTime);

  // 休校日は必ず終日。時間を持たせると「13時から休校」がその日ぜんぶ休校になる
  const closed = kind === EVENT_KIND.CLOSED;

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="p-3 space-y-2.5">
      <div>
        <div className="text-[11px] font-medium text-slate-400 mb-1">種類</div>
        <div className="flex gap-1">
          {[EVENT_KIND.EVENT, EVENT_KIND.CLOSED].map((k) => (
            <label key={k} className="flex-1">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
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
            defaultValue={defaultEndDate}
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <p className="text-[10px] text-slate-400 -mt-1">
        終了日を空にすると1日だけの予定になります
      </p>

      {/* 休校日は必ず終日。時間を持たせても1日ぜんぶが休校として効いてしまうため */}
      {!closed && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              name="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-slate-300"
            />
            終日
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-400">
                  開始時刻
                </span>
                <input
                  type="time"
                  name="startTime"
                  required
                  step={300}
                  defaultValue={defaultStartTime ?? "17:00"}
                  className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-400">
                  終了時刻
                </span>
                <input
                  type="time"
                  name="endTime"
                  required
                  step={300}
                  defaultValue={defaultEndTime ?? "18:20"}
                  className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}
        </>
      )}

      {/* 「毎週日曜は休校」を1日ずつ入れなくて済むようにする */}
      <div>
        <span className="text-[11px] font-medium text-slate-400">繰り返し</span>
        <select
          name="repeat"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        >
          {REPEAT_ORDER.map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {repeat !== REPEAT.NONE && (
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">
            繰り返しの終わり
          </span>
          <input
            type="date"
            name="until"
            required
            defaultValue={shiftDays(defaultDate, 90)}
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
          <span className="text-[10px] text-slate-400">
            この日までのぶんをまとめて作ります。あとで「まとめて削除」もできます
          </span>
        </label>
      )}

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
