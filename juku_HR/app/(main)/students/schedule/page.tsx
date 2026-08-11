import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { addSchedule, removeSchedule, setSlotsPerWeek } from "./actions";
import { getSetting } from "@/lib/settings";
import {
  GRADES,
  LESSON_STYLE,
  TERM_KIND,
  lessonStyleShort,
} from "@/lib/constants";
import { WEEKDAYS } from "@/lib/dates";
import { periodLabeler, type PeriodLite } from "@/lib/periods";
import {
  schedulingShortfalls,
  studentClashes,
  type ScheduleLite,
  type SubjectLinkLite,
} from "@/lib/schedule";

export const metadata = { title: "個別の受講予定｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 個別指導の「量」と「配置」を入れる画面。
 *
 * 量  … 生徒に聞いた「週に何コマ受けたいか」
 * 配置… 担当できる講師の予定を見て決めた「いつやるか」
 *
 * 集団はクラス編成の画面が同じ役割を持つ。
 * ここが埋まると、シフト計画の必要人数を計算で出せるようになる。
 */
export default async function StudentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const sp = await searchParams;

  const [students, subjects, rawLinks, rawSchedules, rawPeriods, terms, setting] =
    await Promise.all([
      prisma.student.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
      prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
      prisma.studentSubject.findMany({ where: { active: true } }),
      prisma.studentSchedule.findMany(),
      prisma.period.findMany({
        where: { termKind: TERM_KIND.REGULAR },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
      }),
      prisma.term.findMany({
        where: { kind: TERM_KIND.REGULAR },
        orderBy: { startDate: "asc" },
      }),
      getSetting(),
    ]);

  const periods: PeriodLite[] = rawPeriods;
  const label = periodLabeler(periods);

  const links: SubjectLinkLite[] = rawLinks.map((l) => ({
    id: l.id,
    studentId: l.studentId,
    subjectId: l.subjectId,
    format: l.format,
    slotsPerWeek: l.slotsPerWeek,
    active: l.active,
  }));
  const schedules: ScheduleLite[] = rawSchedules.map((s) => ({
    studentSubjectId: s.studentSubjectId,
    dayOfWeek: s.dayOfWeek,
    date: s.date,
    periodId: s.periodId,
    fromDate: s.fromDate,
    toDate: s.toDate,
  }));

  // 学期の既定値。いま進行中の学期、無ければ最初の学期。
  const today = new Date().toISOString().slice(0, 10);
  const term =
    terms.find((t) => today >= t.startDate && today <= t.endDate) ?? terms[0] ?? null;

  // 生徒が多いと1画面に収まらないので学年で絞る
  const indivLinks = links.filter((l) => l.format !== LESSON_STYLE.GROUP);
  const gradesWith = GRADES.filter((g) =>
    students.some(
      (s) => s.grade === g && indivLinks.some((l) => l.studentId === s.id),
    ),
  );
  const grade = gradesWith.includes(sp.grade as (typeof GRADES)[number])
    ? sp.grade!
    : (gradesWith[0] ?? "");
  const shown = students.filter((s) => s.grade === grade);

  const subjectName = (id: number) =>
    subjects.find((s) => s.id === id)?.name ?? `科目${id}`;
  const studentName = (id: number) =>
    students.find((s) => s.id === id)?.name ?? `生徒${id}`;

  // 不備。期間は学期に合わせる。
  const shortfalls = term
    ? schedulingShortfalls(links, schedules, term.startDate, term.endDate)
    : [];
  const clashes = studentClashes(links, schedules);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">個別の受講予定</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          「週に何コマ受けるか」と「いつやるか」を入れます。ここが埋まると、
          シフト計画の必要人数を計算で出せます。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">配置は「決めた結果」を入れる場所です。</b>
          担当できる講師がいつ来られるかを{" "}
          <Link href="/shifts" className="text-indigo-600 hover:underline">
            希望の確認
          </Link>{" "}
          で見て決め、決まったものをここに記録します。
        </p>
        <p>
          集団は{" "}
          <Link href="/classes" className="text-indigo-600 hover:underline">
            クラス編成
          </Link>{" "}
          が同じ役割を持ちます。ここは個別だけです。
          個別は1人の講師が<b className="text-slate-700">最大{setting.indivMaxStudents}人</b>
          までみられる設定なので、同じ枠にまとめるほど必要な講師が減ります。
        </p>
      </div>

      {!term && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          レギュラーの期が登録されていません。先に期を登録してください。
        </p>
      )}

      {clashes.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-900 space-y-1">
          <p className="font-medium">同じ生徒が同じ枠に2つ入っています</p>
          <ul className="text-xs space-y-0.5">
            {clashes.map((c, i) => (
              <li key={i}>
                {studentName(c.studentId)} ／{" "}
                {c.date ?? `毎週${WEEKDAYS[c.dayOfWeek ?? 0]}曜`}{" "}
                {label(periods.find((p) => p.id === c.periodId) ?? periods[0])} ／{" "}
                {c.subjectIds.map(subjectName).join("・")}
              </li>
            ))}
          </ul>
          <p className="text-xs">体は1つなので、どちらかを別の枠に移してください。</p>
        </div>
      )}

      {shortfalls.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-medium">
            配置が足りていない生徒が {shortfalls.length} 件あります
          </p>
          <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
            {shortfalls.map((s) => (
              <li key={s.studentSubjectId}>
                {studentName(s.studentId)} ／ {subjectName(s.subjectId)} ／ 週
                {s.want}コマ希望のうち <b>{s.placed}コマ</b>だけ配置済み
              </li>
            ))}
          </ul>
          <p className="text-xs">
            足りないぶんは必要人数に数えられません。授業の日を迎えても講師が来ません。
          </p>
        </div>
      )}

      {gradesWith.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-8 text-center">
          個別で受講している生徒がいません。先に{" "}
          <Link href="/students/subjects" className="text-indigo-600 hover:underline">
            受講科目
          </Link>{" "}
          で登録してください。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">学年</span>
            {gradesWith.map((g) => (
              <Link
                key={g}
                href={`/students/schedule?grade=${encodeURIComponent(g)}`}
                className={`px-2.5 py-1 text-sm rounded ${
                  grade === g
                    ? "bg-slate-900 text-white font-medium"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {g}
              </Link>
            ))}
          </div>

          <div className="space-y-3">
            {shown.map((student) => {
              const mine = indivLinks.filter((l) => l.studentId === student.id);
              if (mine.length === 0) return null;
              return (
                <section
                  key={student.id}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-2 border-b border-slate-200">
                    <h2 className="font-semibold text-slate-900 text-sm">
                      {student.name}
                      <span className="ml-2 text-[11px] font-normal text-slate-400">
                        {student.grade}
                      </span>
                    </h2>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {mine.map((link) => {
                      const placed = rawSchedules.filter(
                        (s) => s.studentSubjectId === link.id,
                      );
                      const short = link.slotsPerWeek - placed.length;
                      return (
                        <li key={link.id} className="px-4 py-2.5 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-slate-900 w-16">
                              {subjectName(link.subjectId)}
                            </span>
                            <span className="text-[10px] bg-sky-50 text-sky-700 rounded px-1.5 py-0.5">
                              {lessonStyleShort(link.format)}
                            </span>

                            <form
                              action={setSlotsPerWeek}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="hidden"
                                name="studentSubjectId"
                                value={link.id}
                              />
                              <span className="text-xs text-slate-500">週</span>
                              <input
                                name="slotsPerWeek"
                                type="number"
                                min={0}
                                max={20}
                                defaultValue={link.slotsPerWeek}
                                aria-label={`${subjectName(link.subjectId)}の週コマ数`}
                                className="w-14 border border-slate-300 rounded px-1.5 py-0.5 text-sm text-right tabular-nums"
                              />
                              <span className="text-xs text-slate-500">コマ</span>
                              <button
                                type="submit"
                                className="px-2 py-0.5 text-[11px] border border-slate-300 rounded hover:bg-slate-50"
                              >
                                保存
                              </button>
                            </form>

                            {short > 0 && (
                              <span className="text-[11px] text-amber-700">
                                あと{short}コマ配置が必要
                              </span>
                            )}
                            {short < 0 && (
                              <span className="text-[11px] text-slate-400">
                                希望より{-short}コマ多く配置されています
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {placed.map((s) => (
                              <span
                                key={s.id}
                                className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5"
                              >
                                {s.date ?? `${WEEKDAYS[s.dayOfWeek ?? 0]}曜`}
                                {label(
                                  periods.find((p) => p.id === s.periodId) ?? periods[0],
                                )}
                                <form action={removeSchedule} className="inline">
                                  <input type="hidden" name="id" value={s.id} />
                                  <ConfirmSubmit
                                    message={`${student.name} さんの ${subjectName(link.subjectId)} のこの枠を外しますか？`}
                                    className="text-slate-400 hover:text-rose-600"
                                  >
                                    ×
                                  </ConfirmSubmit>
                                </form>
                              </span>
                            ))}

                            {term && periods.length > 0 && (
                              <form
                                action={addSchedule}
                                className="inline-flex items-center gap-1"
                              >
                                <input
                                  type="hidden"
                                  name="studentSubjectId"
                                  value={link.id}
                                />
                                <input
                                  type="hidden"
                                  name="fromDate"
                                  value={term.startDate}
                                />
                                <input type="hidden" name="toDate" value={term.endDate} />
                                <select
                                  name="dayOfWeek"
                                  defaultValue={1}
                                  aria-label="曜日"
                                  className="border border-slate-300 rounded px-1 py-0.5 text-[11px]"
                                >
                                  {WEEKDAYS.map((w, i) => (
                                    <option key={i} value={i}>
                                      {w}曜
                                    </option>
                                  ))}
                                </select>
                                <select
                                  name="periodId"
                                  defaultValue={periods[0].id}
                                  aria-label="コマ"
                                  className="border border-slate-300 rounded px-1 py-0.5 text-[11px]"
                                >
                                  {periods.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {label(p)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="px-2 py-0.5 text-[11px] bg-slate-900 text-white rounded hover:bg-slate-800"
                                >
                                  枠を足す
                                </button>
                              </form>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {term && (
            <p className="text-[11px] text-slate-400">
              追加する枠は {term.name}（{term.startDate} 〜 {term.endDate}）に対して作られます。
            </p>
          )}
        </>
      )}
    </div>
  );
}
