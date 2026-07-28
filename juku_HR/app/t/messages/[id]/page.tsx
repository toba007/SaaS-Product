import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { answerMySurvey, markRead } from "../../actions";
import { MESSAGE_KIND, MESSAGE_KIND_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MyMessageDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireAuth("/t/messages");

  const messageId = Number(id);
  if (!Number.isInteger(messageId)) notFound();

  const item = await prisma.messageRecipient.findUnique({
    where: { messageId_teacherId: { messageId, teacherId: teacher.id } },
    include: { message: true },
  });
  // 自分宛てでない連絡は見せない
  if (!item) notFound();

  // 開いた時点で既読にする。講師に「既読にする」ボタンを押させない。
  if (!item.readAt) await markRead(teacher.id, messageId);

  const isSurvey = item.message.kind === MESSAGE_KIND.SURVEY;
  const options = item.message.options
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div>
        <Link href={`/t/messages`} className="text-xs text-indigo-600">
          ← 連絡
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isSurvey ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"
            }`}
          >
            {MESSAGE_KIND_LABEL[item.message.kind]}
          </span>
          <h1 className="font-bold text-slate-900">{item.message.title}</h1>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {new Date(item.message.createdAt).toLocaleString("ja-JP")}
        </p>
      </div>

      {item.message.body && (
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-3">
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {item.message.body}
          </p>
        </div>
      )}

      {isSurvey && (
        <section className="bg-white border border-slate-200 rounded-lg">
          <div className="px-3 py-2 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">回答</h2>
            {item.answer && (
              <p className="text-[11px] text-emerald-700">
                回答済み。変えたいときは選び直して保存してください。
              </p>
            )}
          </div>
          <form action={answerMySurvey} className="p-3 space-y-2">
            
            <input type="hidden" name="messageId" value={messageId} />

            {options.length > 0 ? (
              <div className="space-y-1.5">
                {options.map((o) => (
                  <label key={o} className="block">
                    <input
                      type="radio"
                      name="answer"
                      value={o}
                      defaultChecked={item.answer === o}
                      className="peer sr-only"
                    />
                    <span className="block text-sm px-3 py-2.5 rounded border border-slate-200 text-slate-700 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 peer-checked:text-white peer-checked:font-medium">
                      {o}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                name="answer"
                rows={4}
                defaultValue={item.answer ?? ""}
                placeholder="ここに書いてください"
                className="w-full border border-slate-200 rounded px-2 py-2 text-sm resize-y"
              />
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded active:bg-indigo-700"
            >
              {item.answer ? "回答を変える" : "回答する"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
