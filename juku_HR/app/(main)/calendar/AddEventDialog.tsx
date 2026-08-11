"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { EventForm } from "./EventForm";
import { formatDateJP } from "@/lib/constants";

/**
 * カレンダーの日付を押したときに開く、その日の予定を追加するダイアログ。
 *
 * 開いているかどうかは URL の ?day= で決めている。画面内の状態にしないのは、
 * カレンダー本体（FullCalendar のクライアント部品）と自前の月表示（サーバー部品）の
 * 両方から同じダイアログを開きたいためで、URL にしておけば橋渡しが要らない。
 * 戻るボタンで閉じられるのと、日付付きのURLを人に渡せるのも都合がよい。
 */
export function AddEventDialog({
  date,
  endDate,
  startTime,
  endTime,
  closeHref,
}: {
  date: string;
  /** ドラッグで期間を選んだときの最終日。1日だけなら渡さない */
  endDate?: string;
  /** 時間軸の上でなぞったときの時刻。無ければ終日として開く */
  startTime?: string;
  endTime?: string;
  /** 閉じたときに戻る先。?day= を落としたURL */
  closeHref: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  // ?day= が付いている間だけこの部品が置かれるので、出てきた時点で開いてよい
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const close = useCallback(() => {
    router.replace(closeHref, { scroll: false });
  }, [router, closeHref]);

  return (
    <dialog
      ref={ref}
      // Esc で閉じたときも URL を戻す。戻さないと、次に同じ日を押しても開かない
      onClose={close}
      onClick={(e) => {
        // 背景（ダイアログ自身）を押したら閉じる。中身を押したときは閉じない
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(92vw,22rem)] rounded-lg border border-slate-200 bg-white p-0 backdrop:bg-slate-900/40"
    >
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 text-sm">
          {endDate && endDate !== date
            ? `${formatDateJP(date)}〜${formatDateJP(endDate)}の予定を追加`
            : startTime
              ? `${formatDateJP(date)} ${startTime}〜${endTime} の予定を追加`
              : `${formatDateJP(date)}の予定を追加`}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="閉じる"
          className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      <EventForm
        key={`${date}_${endDate ?? ""}_${startTime ?? ""}`}
        defaultDate={date}
        defaultEndDate={endDate}
        defaultStartTime={startTime}
        defaultEndTime={endTime}
        onDone={() => ref.current?.close()}
      />
    </dialog>
  );
}
