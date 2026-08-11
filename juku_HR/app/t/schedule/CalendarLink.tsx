"use client";

import { useState } from "react";
import { regenerateIcsToken } from "../actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";

/**
 * 確定シフトを、普段使っているカレンダーアプリに取り込むための案内。
 *
 * 一度設定すれば済む作業なので、既定では畳んでおく。
 * TimeTree と Lifebear はこのURLを直接登録できないため、Googleカレンダーか
 * 端末のカレンダーを経由する必要がある。そこを書いておかないと、
 * 「登録できない」という問い合わせがそのまま来る。
 */
export function CalendarLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <details className="bg-white border border-slate-200 rounded-lg">
      <summary className="px-3 py-2.5 text-sm font-semibold text-slate-900 cursor-pointer list-none flex items-center justify-between">
        <span>📆 スマホのカレンダーに取り込む</span>
        <span className="text-[10px] text-slate-400 font-normal">開く</span>
      </summary>

      <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
        <div>
          <div className="flex gap-1.5">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono text-slate-600 bg-slate-50"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 px-3 py-1.5 text-xs rounded bg-slate-900 text-white"
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
          <p className="text-[10px] text-rose-600 mt-1">
            このURLを知っている人は、あなたのシフトを見られます。人に渡さないでください
          </p>
        </div>

        <div className="text-[11px] text-slate-600 space-y-2">
          <div>
            <span className="font-medium text-slate-800">Googleカレンダー</span>
            <br />
            パソコンで開き、左の「他のカレンダー」＋ →「URLで追加」に貼り付けます。
            <span className="text-slate-400">
              （Google側の仕様で、反映は数時間〜1日ほど遅れます）
            </span>
          </div>
          <div>
            <span className="font-medium text-slate-800">iPhoneのカレンダー</span>
            <br />
            設定 → アプリ → カレンダー → アカウント → アカウントを追加 →
            「その他」→「照会するカレンダーを追加」に貼り付けます。
            <span className="text-slate-400">こちらの方が反映が速いです</span>
          </div>
          <div>
            <span className="font-medium text-slate-800">
              TimeTree・Lifebear
            </span>
            <br />
            このURLを直接は登録できません。先にGoogleカレンダーへ登録してから、
            アプリ側でGoogleカレンダーとの連携を有効にしてください（表示のみになります）。
          </div>
        </div>

        <form action={regenerateIcsToken} className="pt-1 border-t border-slate-100">
          <ConfirmSubmit
            message="URLを作り直しますか？ 今のURLは使えなくなり、登録済みのカレンダーからは予定が消えます。もう一度登録し直してください。"
            className="text-[10px] text-slate-400"
          >
            URLを作り直す（人に見られてしまったとき）
          </ConfirmSubmit>
        </form>
      </div>
    </details>
  );
}
