import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toggleDelivered, updateCard } from "@/app/actions";
import { PrintButton } from "@/app/components/PrintButton";
import { StatusBadge } from "@/app/components/StatusBadge";
import { CARD_STATUS, FORMAT_LABEL, formatDateJP } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isInteger(cardId)) notFound();

  const card = await prisma.absenceCard.findUnique({
    where: { id: cardId },
    include: {
      student: true,
      teacher: true,
      lesson: {
        include: { subject: true, period: true, room: true, record: true },
      },
    },
  });
  if (!card) notFound();

  const delivered = card.status === CARD_STATUS.DELIVERED;
  const rec = card.lesson.record;
  const edited =
    !!rec && (card.progress !== rec.progress || card.homework !== rec.homework);

  return (
    <div className="space-y-5">
      <div className="no-print flex items-start justify-between gap-4">
        <div>
          <Link
            href="/cards"
            className="text-sm text-indigo-600 hover:underline"
          >
            ← 欠席者カード
          </Link>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {card.student.name} さんのカード
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDateJP(card.lesson.date)} {card.lesson.period.name} ／{" "}
            {card.lesson.subject.name} ／ {card.teacher.name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={card.status} />
        </div>
      </div>

      {/* 渡す紙そのもの */}
      <div className="print-area bg-white border border-slate-300 rounded-lg p-6 max-w-2xl mx-auto">
        <div className="text-center border-b-2 border-slate-800 pb-2 mb-4">
          <h2 className="text-lg font-bold tracking-widest text-slate-900">
            欠席者カード
          </h2>
        </div>

        <table className="w-full text-sm mb-4">
          <tbody>
            <tr>
              <Th>生徒</Th>
              <Td>
                {card.student.name}
                <span className="text-xs text-slate-500 ml-2">
                  {card.student.grade}
                </span>
              </Td>
              <Th>日付</Th>
              <Td>{formatDateJP(card.lesson.date)}</Td>
            </tr>
            <tr>
              <Th>担当講師</Th>
              <Td>{card.teacher.name}</Td>
              <Th>授業</Th>
              <Td>
                {card.lesson.subject.name}（{FORMAT_LABEL[card.lesson.format]}）
                {card.lesson.period.name}
              </Td>
            </tr>
          </tbody>
        </table>

        <Block title="授業で進んだ内容" body={card.progress} />
        <Block title="宿題" body={card.homework} />
        <Block title="先生から" body={card.comment} />
      </div>

      <div className="no-print max-w-2xl mx-auto flex items-center gap-2">
        <PrintButton />
        <form action={toggleDelivered}>
          <input type="hidden" name="cardId" value={card.id} />
          <button
            type="submit"
            className={`text-sm font-medium px-4 py-2 rounded ${
              delivered
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {delivered ? "受渡を取り消す" : "生徒に渡した"}
          </button>
        </form>
        {delivered && card.deliveredAt && (
          <span className="text-xs text-slate-500">
            {new Date(card.deliveredAt).toLocaleString("ja-JP", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            に受渡
          </span>
        )}
      </div>

      {/* 編集 */}
      <section className="no-print bg-white rounded-lg border border-slate-200 max-w-2xl mx-auto">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">カードを編集</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            進んだ内容と宿題は授業記録から自動で入っています。個別指導などで生徒ごとに
            変えたいときだけ直してください。
          </p>
        </div>
        <form action={updateCard} className="p-4 space-y-3">
          <input type="hidden" name="cardId" value={card.id} />
          <Field
            label="授業で進んだ内容"
            name="progress"
            defaultValue={card.progress}
            rows={2}
          />
          <Field label="宿題" name="homework" defaultValue={card.homework} rows={2} />
          <Field
            label="先生から（この生徒へのひとこと）"
            name="comment"
            defaultValue={card.comment}
            rows={3}
            placeholder="例: 次回、今日の範囲の確認テストをします。"
          />
          {edited && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              このカードは授業記録から書き換えられています。授業記録を直しても、
              ここは上書きされません。
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-indigo-700"
            >
              保存
            </button>
            {card.status === CARD_STATUS.DRAFT && (
              <button
                type="submit"
                name="markReady"
                value="1"
                className="border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-2 rounded hover:bg-indigo-100"
              >
                保存して「渡せる」にする
              </button>
            )}
          </div>
        </form>
      </section>

      <div className="no-print max-w-2xl mx-auto">
        <Link
          href={`/lessons/${card.lessonId}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          この授業を開く →
        </Link>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left align-top bg-slate-50 border border-slate-300 px-2 py-1.5 font-medium text-slate-600 text-xs w-20">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="align-top border border-slate-300 px-2 py-1.5 text-slate-900">
      {children}
    </td>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-600 mb-1">{title}</div>
      <div className="border border-slate-300 rounded px-3 py-2 min-h-16 text-sm text-slate-900 whitespace-pre-wrap">
        {body || <span className="text-slate-300">（未記入）</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  rows,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full border border-slate-200 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </label>
  );
}
