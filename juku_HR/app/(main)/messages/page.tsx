import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createMessage } from "./actions";
import { MESSAGE_KIND, MESSAGE_KIND_LABEL } from "@/lib/constants";

export const metadata = { title: "講師連絡｜塾HR" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const [messages, teachers] = await Promise.all([
    prisma.message.findMany({
      include: { recipients: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">講師連絡</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          連絡先を交換しなくても、ここから講師に連絡できます。既読が分かります。
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-2">
          {messages.length === 0 ? (
            <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
              まだ連絡がありません
            </p>
          ) : (
            messages.map((m) => {
              const read = m.recipients.filter((r) => r.readAt).length;
              const answered = m.recipients.filter((r) => r.answer).length;
              const all = m.recipients.length;
              return (
                <Link
                  key={m.id}
                  href={`/messages/${m.id}`}
                  className="block bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-300"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        m.kind === MESSAGE_KIND.SURVEY
                          ? "bg-violet-50 text-violet-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {MESSAGE_KIND_LABEL[m.kind]}
                    </span>
                    <span className="font-medium text-slate-900 truncate">
                      {m.title}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                      {new Date(m.createdAt).toLocaleDateString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {m.body && (
                    <p className="text-xs text-slate-500 mt-1 truncate">{m.body}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-24 h-1.5 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(read / all) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        既読 {read}/{all}
                      </span>
                    </div>
                    {m.kind === MESSAGE_KIND.SURVEY && (
                      <span className="text-[11px] text-violet-700">
                        回答 {answered}/{all}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* 新規作成 */}
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">新しい連絡</h2>
          </div>
          <form action={createMessage} className="p-3 space-y-3">
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">種類</div>
              <div className="flex gap-1">
                {[MESSAGE_KIND.NOTICE, MESSAGE_KIND.SURVEY].map((k, i) => (
                  <label key={k} className="flex-1">
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      defaultChecked={i === 0}
                      className="peer sr-only"
                    />
                    <span className="block text-center text-xs px-2 py-1.5 rounded border border-slate-200 text-slate-600 cursor-pointer peer-checked:bg-slate-900 peer-checked:border-slate-900 peer-checked:text-white peer-checked:font-medium">
                      {MESSAGE_KIND_LABEL[k]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-400">件名</span>
              <input
                type="text"
                name="title"
                required
                placeholder="例: 夏期講習のシフト追加募集"
                className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-400">本文</span>
              <textarea
                name="body"
                rows={4}
                placeholder="例: 8/10〜8/14 の2限が埋まっていません。入れる方はシフトを更新してください。"
                className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm resize-y"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-400">
                アンケートの選択肢（1行に1つ・空なら自由記述）
              </span>
              <textarea
                name="options"
                rows={3}
                placeholder={"入れます\n入れません\n相談したい"}
                className="mt-1 w-full border border-slate-200 rounded px-2 py-1.5 text-sm resize-y font-mono"
              />
            </label>

            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1">
                宛先（選ばなければ全員に送ります）
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto border border-slate-100 rounded p-2">
                {teachers.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="teacherIds"
                      value={t.id}
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-700">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-indigo-700"
            >
              送る
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
