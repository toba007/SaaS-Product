import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { MESSAGE_KIND, MESSAGE_KIND_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MyMessagesPage() {
  const teacher = await requireAuth("/t/messages");

  // 自分宛てのものだけ
  const items = await prisma.messageRecipient.findMany({
    where: { teacherId: teacher.id },
    include: { message: true },
    orderBy: { message: { createdAt: "desc" } },
  });

  const needsAnswer = items.filter(
    (r) => r.message.kind === MESSAGE_KIND.SURVEY && !r.answer,
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold text-slate-900">連絡</h1>
        <p className="text-[11px] text-slate-500">教室からの連絡とアンケートです</p>
      </div>

      {needsAnswer.length > 0 && (
        <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          未回答のアンケートが {needsAnswer.length} 件あります
        </p>
      )}

      {items.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          連絡はありません
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/t/messages/${r.messageId}`}
                className={`block bg-white border rounded-lg px-3 py-2.5 active:bg-slate-50 ${
                  r.readAt ? "border-slate-200" : "border-indigo-300 bg-indigo-50/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  {!r.readAt && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      r.message.kind === MESSAGE_KIND.SURVEY
                        ? "bg-violet-50 text-violet-700"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    {MESSAGE_KIND_LABEL[r.message.kind]}
                  </span>
                  <span
                    className={`text-sm truncate ${r.readAt ? "text-slate-700" : "text-slate-900 font-medium"}`}
                  >
                    {r.message.title}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-400 shrink-0">
                    {new Date(r.message.createdAt).toLocaleDateString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {r.message.kind === MESSAGE_KIND.SURVEY && (
                  <div className="mt-1">
                    {r.answer ? (
                      <span className="text-[11px] text-emerald-700">
                        回答済: {r.answer}
                      </span>
                    ) : (
                      <span className="text-[11px] text-violet-700 font-medium">
                        未回答
                      </span>
                    )}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
