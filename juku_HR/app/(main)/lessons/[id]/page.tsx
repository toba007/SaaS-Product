import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saveLessonRecord, setAttendance } from "@/app/actions";
import { StatusBadge } from "@/app/components/StatusBadge";
import {
  ATTENDANCE,
  ATTENDANCE_LABEL,
  CARD_STATUS_LABEL,
  FORMAT_LABEL,
  formatDateJP,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATUS_ORDER = [
  ATTENDANCE.PRESENT,
  ATTENDANCE.ABSENT,
  ATTENDANCE.LATE,
  ATTENDANCE.MAKEUP,
];

export default async function LessonDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lessonId = Number(id);
  if (!Number.isInteger(lessonId)) notFound();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      period: true,
      subject: true,
      teacher: true,
      room: true,
      record: true,
      attendances: { include: { student: true } },
      cards: { include: { student: true } },
    },
  });
  if (!lesson) notFound();

  const roster = [...lesson.attendances].sort((a, b) =>
    a.student.name.localeCompare(b.student.name, "ja"),
  );
  const absentees = roster.filter((a) => a.status === ATTENDANCE.ABSENT);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/lessons?date=${lesson.date}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← {formatDateJP(lesson.date)}の授業
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">
          {lesson.title || `${FORMAT_LABEL[lesson.format]} ${lesson.subject.name}`}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {formatDateJP(lesson.date)} {lesson.period.name}{" "}
          {lesson.period.startTime}-{lesson.period.endTime} ／{" "}
          {lesson.teacher.name} ／ {lesson.room.name}
        </p>
      </div>

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">授業記録</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ここに1回書けば、欠席者全員のカードに自動で入ります
          </p>
        </div>
        <form action={saveLessonRecord} className="p-4 space-y-3">
          <input type="hidden" name="lessonId" value={lesson.id} />
          <Field
            label="授業で進んだ内容"
            name="progress"
            defaultValue={lesson.record?.progress ?? ""}
            placeholder="例: 二次方程式の解の公式（テキストp.42-45）"
            rows={2}
          />
          <Field
            label="宿題"
            name="homework"
            defaultValue={lesson.record?.homework ?? ""}
            placeholder="例: ワークp.20-21 全問"
            rows={2}
          />
          <Field
            label="塾内メモ"
            name="note"
            defaultValue={lesson.record?.note ?? ""}
            placeholder="カードには載りません。引き継ぎ用。"
            rows={1}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-indigo-700"
            >
              保存
            </button>
            {lesson.record && (
              <span className="text-xs text-slate-500">
                最終更新{" "}
                {new Date(lesson.record.updatedAt).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">
            出欠
            <span className="ml-2 text-sm font-normal text-slate-500">
              {roster.length}名
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            「欠席」にするとカードが自動で作られます
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {roster.map((a) => {
            const card = lesson.cards.find((c) => c.studentId === a.studentId);
            return (
              <li
                key={a.id}
                className="px-4 py-2 flex items-center gap-3 flex-wrap"
              >
                <span className="text-sm text-slate-900 w-32 shrink-0">
                  {a.student.name}
                </span>
                <span className="text-xs text-slate-500 w-10 shrink-0">
                  {a.student.grade}
                </span>
                <form action={setAttendance} className="flex gap-1">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="studentId" value={a.studentId} />
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="submit"
                      name="status"
                      value={s}
                      className={`text-xs px-2.5 py-1 rounded border ${
                        a.status === s
                          ? s === ATTENDANCE.ABSENT
                            ? "bg-amber-500 border-amber-500 text-white font-medium"
                            : "bg-slate-700 border-slate-700 text-white font-medium"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      {ATTENDANCE_LABEL[s]}
                    </button>
                  ))}
                </form>
                {card && (
                  <Link
                    href={`/cards/${card.id}`}
                    className="ml-auto text-xs text-indigo-600 hover:underline shrink-0"
                  >
                    カード（{CARD_STATUS_LABEL[card.status]}）→
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {absentees.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">
              この授業の欠席者カード
              <span className="ml-2 text-sm font-normal text-slate-500">
                {lesson.cards.length}枚
              </span>
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {lesson.cards.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cards/${c.id}`}
                  className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-900">{c.student.name}</span>
                  <span className="text-xs text-slate-500 truncate">
                    {c.comment || "ひとことがまだ書かれていません"}
                  </span>
                  <span className="ml-auto text-xs shrink-0">
                    <StatusBadge status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!lesson.record && (
            <p className="px-4 py-3 text-xs text-amber-800 bg-amber-50 border-t border-amber-100">
              授業記録がまだ空です。上に書くと、カードにも自動で入ります。
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  rows,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  rows: number;
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
