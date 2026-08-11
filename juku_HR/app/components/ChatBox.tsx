"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { postComment, type CommentState } from "@/app/comments/actions";
import { COMMENT_BODY_MAX } from "@/lib/constants";

export type ChatMessage = {
  id: number;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

/** 相手の新着を拾う間隔。常時接続はしていないので、開いている間だけ取りに行く。 */
const POLL_MS = 15_000;

function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * その日のやりとり。自分は右、相手は左に出す。
 *
 * 相手の発言が勝手に降ってくる作りにはなっていないので、開いている間だけ
 * 一定間隔で取り直している。常時接続ではないぶん、数秒の遅れは出る。
 */
export function ChatBox({
  messages,
  viewerRole,
  teacherId,
  date,
}: {
  messages: ChatMessage[];
  viewerRole: string;
  teacherId: number;
  date: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CommentState, FormData>(
    postComment,
    {},
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // 新しい発言は下に増えるので、開いたときと増えたときは一番下を見せる
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // 送信が通ったら入力欄を空にする（エラーのときは打ち直しにならないよう残す）
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state.error]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  // 「既読」は自分の発言のうち、相手が読んだ最後のものにだけ付ける
  const lastReadMine = messages
    .filter((m) => m.senderRole === viewerRole && m.readAt)
    .at(-1)?.id;

  return (
    <div className="flex flex-col">
      <div className="max-h-72 overflow-y-auto px-3 py-2.5 space-y-2 bg-slate-50">
        {messages.length === 0 ? (
          <p className="text-center text-[11px] text-slate-400 py-6">
            この日についてのやりとりはまだありません
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderRole === viewerRole;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}
              >
                <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                  {!mine && (
                    <div className="text-[10px] text-slate-500 mb-0.5 px-1">
                      {m.senderName}
                    </div>
                  )}
                  <div
                    className={`inline-block text-sm leading-snug px-2.5 py-1.5 rounded-2xl whitespace-pre-wrap break-words text-left ${
                      mine
                        ? "bg-emerald-400 text-slate-900 rounded-br-sm"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
                <div className="text-[9px] text-slate-400 pb-0.5 shrink-0">
                  {mine && m.id === lastReadMine && <div>既読</div>}
                  {hhmm(m.createdAt)}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="flex items-end gap-1.5 p-2 border-t border-slate-200 bg-white"
      >
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="teacherId" value={teacherId} />
        <textarea
          name="body"
          rows={1}
          maxLength={COMMENT_BODY_MAX}
          placeholder="この日について書く"
          className="flex-1 resize-none border border-slate-200 rounded-2xl px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400"
          onKeyDown={(e) => {
            // 改行はそのまま打てるようにして、送信は Ctrl/⌘+Enter に割り当てる
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-3 py-1.5 text-sm rounded-2xl bg-slate-900 text-white disabled:opacity-40"
        >
          {pending ? "…" : "送信"}
        </button>
      </form>

      {state.error && (
        <p className="px-3 pb-2 text-[11px] text-rose-600 bg-white">{state.error}</p>
      )}
    </div>
  );
}
