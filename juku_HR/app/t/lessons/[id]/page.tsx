import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { saveMyLessonRecord, setMyAttendance } from "../../actions";
import {
  ATTENDANCE,
  ATTENDANCE_LABEL,
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

export default async function MyLessonDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await requireAuth("/t/lessons");

  const lessonId = Number(id);
  if (!Number.isInteger(lessonId)) notFound();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      period: true,
      subject: true,
      room: true,
      record: true,
      attendances: { include: { student: true } },
      cards: true,
    },
  });
  // 自分が担当していない授業は見せない
  if (!lesson || lesson.teacherId !== teacher.id) notFound();

  const roster = [...lesson.attendances].sort((a, b) =>
    a.student.name.localeCompare(b.student.name, "ja"),
  );
  const absentees = roster.filter((a) => a.status === ATTENDANCE.ABSENT);

  return (
    <div className="space-y-3">
      <div>
        <Link
          href={`/t/lessons`}
          className="text-xs text-indigo-600"
        >
          ← 授業記録
        </Link>
        <h1 className="font-bold text-slate-900 mt-1">
          {lesson.title || `${FORMAT_LABEL[lesson.format]} ${lesson.subject.name}`}
        </h1>
        <p className="text-[11px] text-slate-500">
          {formatDateJP(lesson.date)} {lesson.period.name}{" "}
          {lesson.period.startTime}-{lesson.period.endTime}／{lesson.room.name}
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-3 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">授業記録</h2>
          <p className="text-[11px] text-slate-500">
            1回書けば、欠席者のカードに自動で入ります
          </p>
        </div>
        <form action={saveMyLessonRecord} className="p-3 space-y-2.5">
          
          <input type="hidden" name="lessonId" value={lesson.id} />
          <Field
            label="授業で進んだ内容"
            name="progress"
            defaultValue={lesson.record?.progress ?? ""}
            placeholder="例: 二次方程式の解の公式（テキストp.42-45）"
            rows={3}
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
            placeholder="カードには載りません"
            rows={2}
          />
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded active:bg-indigo-700"
          >
            保存
          </button>
          {lesson.record && (
            <p className="text-[10px] text-slate-400 text-center">
              最終更新{" "}
              {new Date(lesson.record.updatedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-3 py-2 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">
            出欠 <span className="font-normal text-slate-500">{roster.length}名</span>
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {roster.map((a) => (
            <li key={a.id} className="px-3 py-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm text-slate-900">{a.student.name}</span>
                <span className="text-[10px] text-slate-400">{a.student.grade}</span>
              </div>
              <form action={setMyAttendance} className="flex gap-1">
                
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="studentId" value={a.studentId} />
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="submit"
                    name="status"
                    value={s}
                    className={`flex-1 text-xs px-1 py-1.5 rounded border ${
                      a.status === s
                        ? s === ATTENDANCE.ABSENT
                          ? "bg-amber-500 border-amber-500 text-white font-medium"
                          : "bg-slate-700 border-slate-700 text-white font-medium"
                        : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    {ATTENDANCE_LABEL[s]}
                  </button>
                ))}
              </form>
            </li>
          ))}
        </ul>
      </section>

      {absentees.length > 0 && (
        <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
          欠席 {absentees.length}名ぶんの欠席者カードが作られました。
          生徒ごとのひとことは教室のPCから追記できます。
        </p>
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
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full border border-slate-200 rounded px-2 py-2 text-sm resize-y"
      />
    </label>
  );
}
