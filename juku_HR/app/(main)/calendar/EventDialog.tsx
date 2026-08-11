"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent, updateEvent, type EventState } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { EVENT_KIND, EVENT_KIND_LABEL, formatDateJP } from "@/lib/constants";

export type EventDetail = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  kind: string;
  note: string;
  /** "HH:MM"。null なら終日 */
  startTime: string | null;
  endTime: string | null;
  /** 繰り返しで作られたものは値が入る。同じまとまりの件数を数えるのに使う */
  seriesId: string | null;
  /** 同じまとまりの件数（1件だけなら繰り返しではない） */
  seriesCount: number;
};

/**
 * カレンダーの予定を押したときに開くダイアログ。
 *
 * Google カレンダーと同じく、まず中身を見せて、鉛筆を押すとその場で直せる。
 * 以前は「消して入れ直す」しか無かったが、名前の打ち間違いを直すのに
 * 削除の確認まで通らせるのは無理がある。
 *
 * 開いているかどうかは URL の ?event= で持つ。カレンダー本体（クライアント部品）と
 * 一覧（サーバー部品）のどちらから開いても同じものが出る。
 */
export function EventDialog({
  event,
  closeHref,
}: {
  event: EventDetail;
  /** 閉じたときに戻る先。?event= を落としたURL */
  closeHref: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const close = useCallback(() => {
    router.replace(closeHref, { scroll: false });
  }, [router, closeHref]);

  const closed = event.kind === EVENT_KIND.CLOSED;
  const repeating = event.seriesId !== null && event.seriesCount > 1;
  const warn = closed
    ? " 休校日でなくなると、この日にシフトを出せるようになります。"
    : "";
  const days =
    event.startDate === event.endDate
      ? formatDateJP(event.startDate)
      : `${formatDateJP(event.startDate)} 〜 ${formatDateJP(event.endDate)}`;
  const period = event.startTime
    ? `${days} ${event.startTime}〜${event.endTime}`
    : `${days}（終日）`;

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(92vw,24rem)] rounded-lg border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
    >
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <h2 className="font-semibold text-slate-900 text-sm flex-1">
          {editing ? "予定を直す" : "予定"}
        </h2>

        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="直す"
            aria-label="直す"
            className="text-slate-400 hover:text-indigo-600 px-1"
          >
            ✎
          </button>
        )}

        {!repeating && (
          <form action={deleteEvent} className="flex">
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="next" value={closeHref} />
            <ConfirmSubmit
              message={`「${event.title}」を削除しますか？${warn}`}
              className="text-slate-400 hover:text-rose-600 px-1"
            >
              <span title="削除" aria-label="削除">
                🗑
              </span>
            </ConfirmSubmit>
          </form>
        )}

        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="閉じる"
          className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      {editing ? (
        <EditForm event={event} onDone={() => setEditing(false)} />
      ) : (
        <div className="p-4 space-y-2">
          <div className="flex items-start gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                closed ? "bg-rose-100 text-rose-700" : "bg-sky-50 text-sky-700"
              }`}
            >
              {EVENT_KIND_LABEL[event.kind]}
            </span>
            <span className="text-sm text-slate-900 font-medium break-words">
              {event.title}
            </span>
          </div>

          <div className="text-xs text-slate-500">{period}</div>
          {event.note && (
            <div className="text-xs text-slate-500 whitespace-pre-wrap">
              {event.note}
            </div>
          )}

          {closed && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              休校日です。この予定を消すと、講師はこの日にシフト希望を出せるようになります
            </p>
          )}

          {repeating && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 mb-1.5">
                繰り返しの予定です（全 {event.seriesCount} 件）。
                消す範囲を選んでください
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { scope: "this", label: "この予定だけ" },
                  { scope: "after", label: "これ以降" },
                  { scope: "all", label: "すべて" },
                ].map((b) => (
                  <form key={b.scope} action={deleteEvent}>
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="scope" value={b.scope} />
                    <input type="hidden" name="next" value={closeHref} />
                    <ConfirmSubmit
                      message={
                        b.scope === "all"
                          ? `「${event.title}」を全 ${event.seriesCount} 件まとめて削除しますか？${warn}`
                          : b.scope === "after"
                            ? `${event.startDate} 以降の「${event.title}」を削除しますか？${warn}`
                            : `この日の「${event.title}」だけを削除しますか？${warn}`
                      }
                      className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-600"
                    >
                      {b.label}
                    </ConfirmSubmit>
                  </form>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

function EditForm({
  event,
  onDone,
}: {
  event: EventDetail;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<EventState, FormData>(
    updateEvent,
    {},
  );
  const [kind, setKind] = useState<string>(event.kind);
  const [allDay, setAllDay] = useState(event.startTime === null);
  // 休校日は必ず終日（isClosedDate が日付だけで判定しているため）
  const isClosedKind = kind === EVENT_KIND.CLOSED;

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="p-4 space-y-2.5">
      <input type="hidden" name="id" value={event.id} />

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
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">予定の名前</span>
        <input
          type="text"
          name="title"
          required
          defaultValue={event.title}
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
            defaultValue={event.startDate}
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">終了日</span>
          <input
            type="date"
            name="endDate"
            defaultValue={event.endDate}
            className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {!isClosedKind && (
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
                  defaultValue={event.startTime ?? "17:00"}
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
                  defaultValue={event.endTime ?? "18:20"}
                  className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}
        </>
      )}

      <label className="block">
        <span className="text-[11px] font-medium text-slate-400">メモ</span>
        <input
          type="text"
          name="note"
          defaultValue={event.note}
          className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
        >
          やめる
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
