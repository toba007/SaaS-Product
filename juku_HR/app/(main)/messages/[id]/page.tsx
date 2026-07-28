import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { answerSurvey, deleteMessage, toggleRead } from "../actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import {
  EMPLOYMENT_LABEL,
  MESSAGE_KIND,
  MESSAGE_KIND_LABEL,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MessageDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId)) notFound();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      recipients: { include: { teacher: true }, orderBy: { teacherId: "asc" } },
    },
  });
  if (!message) notFound();

  const isSurvey = message.kind === MESSAGE_KIND.SURVEY;
  const options = message.options
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const read = message.recipients.filter((r) => r.readAt).length;
  const unread = message.recipients.filter((r) => !r.readAt);
  const answered = message.recipients.filter((r) => r.answer);

  // アンケートの集計。選択肢があるものだけ数える。
  const tally = options.map((o) => ({
    option: o,
    count: answered.filter((r) => r.answer === o).length,
  }));
  const maxCount = Math.max(1, ...tally.map((t) => t.count));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/messages" className="text-sm text-indigo-600 hover:underline">
            ← 講師連絡
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isSurvey
                  ? "bg-violet-50 text-violet-700"
                  : "bg-sky-50 text-sky-700"
              }`}
            >
              {MESSAGE_KIND_LABEL[message.kind]}
            </span>
            <h1 className="text-xl font-bold text-slate-900">{message.title}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(message.createdAt).toLocaleString("ja-JP")}に送信／
            {message.recipients.length}名宛
          </p>
        </div>
        <form action={deleteMessage}>
          <input type="hidden" name="id" value={message.id} />
          <ConfirmSubmit
            message={`「${message.title}」を削除します。既読・回答の記録も消えます。よろしいですか？`}
            className="text-xs text-slate-400 hover:text-rose-600 hover:underline"
          >
            削除
          </ConfirmSubmit>
        </form>
      </div>

      {message.body && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{message.body}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="既読" value={`${read}/${message.recipients.length}`} />
        <Stat label="未読" value={`${unread.length}`} warn={unread.length > 0} />
        {isSurvey && (
          <Stat label="回答" value={`${answered.length}/${message.recipients.length}`} />
        )}
      </div>

      {isSurvey && options.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">回答の集計</h2>
          </div>
          <ul className="p-3 space-y-2">
            {tally.map((t) => (
              <li key={t.option} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-32 shrink-0 truncate">
                  {t.option}
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-900 w-6 text-right">
                  {t.count}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: `${(t.count / maxCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unread.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          未読: {unread.map((r) => r.teacher.name).join("、")}
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">
            {isSurvey ? "既読と回答" : "既読の状況"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            本来は講師がスマホで開いた時点で既読になります。試作なのでここで切り替えられます。
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {message.recipients.map((r) => (
            <li key={r.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-900 w-28 shrink-0">
                {r.teacher.name}
              </span>
              <span className="text-[10px] text-slate-400 w-14 shrink-0">
                {EMPLOYMENT_LABEL[r.teacher.employment]}
              </span>

              <form action={toggleRead}>
                <input type="hidden" name="recipientId" value={r.id} />
                <button
                  type="submit"
                  className={`text-xs px-2 py-1 rounded border ${
                    r.readAt
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-white border-slate-200 text-slate-400 hover:border-slate-400"
                  }`}
                >
                  {r.readAt ? "既読" : "未読"}
                </button>
              </form>

              {isSurvey && (
                <form action={answerSurvey} className="flex items-center gap-1 ml-auto">
                  <input type="hidden" name="recipientId" value={r.id} />
                  {options.length > 0 ? (
                    <select
                      name="answer"
                      defaultValue={r.answer ?? ""}
                      className="border border-slate-200 rounded px-2 py-1 text-xs"
                    >
                      <option value="">未回答</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="answer"
                      defaultValue={r.answer ?? ""}
                      placeholder="自由記述"
                      className="border border-slate-200 rounded px-2 py-1 text-xs w-48"
                    />
                  )}
                  <button
                    type="submit"
                    className="text-xs border border-slate-300 bg-white px-2 py-1 rounded hover:bg-slate-50"
                  >
                    保存
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${warn ? "text-amber-600" : "text-slate-900"}`}
      >
        {value}
      </div>
    </div>
  );
}
