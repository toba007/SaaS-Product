import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AssignBoard, type BoardClass } from "./AssignBoard";
import { ClassForm } from "./ClassForm";
import { closeClassGroup, setClassSlots } from "./actions";
import { duplicateEnrollments, memberCount } from "@/lib/classes";
import { WEEKDAYS } from "@/lib/dates";
import {
  CLASS_LEVEL_MAX,
  GRADES,
  LESSON_STYLE,
  TERM_KIND_LABEL,
  classLevelLabel,
  todayISO,
} from "@/lib/constants";

export const metadata = { title: "クラス編成｜塾HR" };
export const dynamic = "force-dynamic";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; subject?: string }>;
}) {
  const sp = await searchParams;

  const [students, subjects, periods, classes, enrollments, studentSubjects] =
    await Promise.all([
      prisma.student.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
      prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
      prisma.period.findMany({
        orderBy: [{ termKind: "asc" }, { startTime: "asc" }, { id: "asc" }],
      }),
      prisma.classGroup.findMany({
        orderBy: [{ grade: "asc" }, { level: "asc" }],
        include: { sessions: { orderBy: [{ dayOfWeek: "asc" }, { periodId: "asc" }] } },
      }),
      prisma.classEnrollment.findMany(),
      prisma.studentSubject.findMany({
        where: { active: true, format: LESSON_STYLE.GROUP },
      }),
    ]);

  const grades = GRADES.filter((g) => students.some((s) => s.grade === g));
  const grade = grades.includes(sp.grade as (typeof GRADES)[number])
    ? sp.grade!
    : (grades[0] ?? "");
  const subject =
    subjects.find((s) => String(s.id) === sp.subject) ?? subjects[0] ?? null;

  // この学年でこの科目を「集団で」取っている生徒だけを振り分けの対象にする
  const targets = subject
    ? students.filter(
        (s) =>
          s.grade === grade &&
          studentSubjects.some((ss) => ss.studentId === s.id && ss.subjectId === subject.id),
      )
    : [];

  const today = todayISO();
  // いま有効なクラスだけ盤面に出す。終了したクラスは下の一覧で見る。
  const boardClasses = subject
    ? classes.filter(
        (c) => c.grade === grade && c.subjectId === subject.id && c.toDate >= today,
      )
    : [];

  const periodLabel = (id: number) => {
    const p = periods.find((x) => x.id === id);
    if (!p) return `コマ${id}`;
    const kind = p.termKind === "REGULAR" ? "" : `${TERM_KIND_LABEL[p.termKind]} `;
    return `${kind}${p.name}`;
  };

  const placement: Record<number, number> = {};
  for (const s of targets) {
    const e = enrollments.find(
      (x) => x.studentId === s.id && boardClasses.some((c) => c.id === x.classGroupId),
    );
    placement[s.id] = e?.classGroupId ?? 0;
  }

  /** 「月曜 1限・2限」のようにまとめて出す */
  const scheduleLabel = (
    sessions: { dayOfWeek: number; periodId: number }[],
  ): string => {
    if (sessions.length === 0) return "時間割なし";
    const byDay = new Map<number, number[]>();
    for (const s of sessions) {
      byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), s.periodId]);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, ps]) => `${WEEKDAYS[d]}曜 ${ps.map(periodLabel).join("・")}`)
      .join(" / ");
  };

  const boardData: BoardClass[] = boardClasses.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    levelLabel: classLevelLabel(c.level),
    schedule: scheduleLabel(c.sessions),
    capacity: c.capacity,
  }));

  // 学年が上がったときの入れ直しで、古いクラスから外し忘れると起きる
  const dup = duplicateEnrollments(
    classes.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      subjectId: c.subjectId,
      level: c.level,
      capacity: c.capacity,
      fromDate: c.fromDate,
      toDate: c.toDate,
    })),
    enrollments,
  );

  const noSchedule = classes.filter((c) => c.toDate >= today && c.sessions.length === 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">クラス編成</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          生徒をドラッグしてレベル別のクラスに振り分けます。
        </p>
      </div>

      {subjects.length === 0 || students.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {subjects.length === 0 ? "科目" : "生徒"}が登録されていません。
        </p>
      ) : (
        <>
          {noSchedule.length > 0 && (
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              時間割が入っていないクラスが {noSchedule.length} 件あります（
              {noSchedule.map((c) => c.name).join("、")}
              ）。曜日とコマが無いと、必要な講師数が出せません。
            </p>
          )}

          {dup.length > 0 && (
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              同じ科目で2つのクラスに入っている生徒が {dup.length} 人います。
              そのままだと同じ時間に2つの授業に出ることになります。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">学年</span>
              {grades.map((g) => (
                <Link
                  key={g}
                  href={`/classes?grade=${encodeURIComponent(g)}&subject=${subject?.id ?? ""}`}
                  className={`px-2.5 py-1 text-sm rounded ${
                    g === grade
                      ? "bg-indigo-600 text-white font-medium"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {g}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">科目</span>
              {subjects.map((s) => (
                <Link
                  key={s.id}
                  href={`/classes?grade=${encodeURIComponent(grade)}&subject=${s.id}`}
                  className={`px-2.5 py-1 text-sm rounded ${
                    subject?.id === s.id
                      ? "bg-indigo-600 text-white font-medium"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>

          {subject && targets.length === 0 ? (
            <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">
              {grade}で{subject.name}を集団で取っている生徒がいません。
              <Link
                href={`/students/subjects?grade=${encodeURIComponent(grade)}`}
                className="text-indigo-600 hover:underline ml-1"
              >
                受講科目を登録する
              </Link>
            </p>
          ) : subject && boardClasses.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {grade}
              {subject.name}のクラスがまだありません。下のフォームで作ってください。
              対象の生徒は {targets.length} 人います。
            </p>
          ) : (
            subject && (
              <AssignBoard
                subjectId={subject.id}
                subjectName={subject.name}
                students={targets.map((s) => ({
                  id: s.id,
                  name: s.name,
                  grade: s.grade,
                }))}
                classes={boardData}
                placement={placement}
              />
            )
          )}

          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2.5 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900 text-sm">クラスを作る</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                レベルはⅠ〜Ⅲですが、<b>必ず3つ作る必要はありません</b>。
                人数に合わせて要る数だけ作ってください。
              </p>
            </div>
            <div className="px-4 py-3">
              <ClassForm
                grades={grades}
                subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
                periods={periods.map((p) => ({
                  id: p.id,
                  label: `${periodLabel(p.id)} ${p.startTime}-${p.endTime}`,
                }))}
                weekdays={[...WEEKDAYS]}
                levels={Array.from({ length: CLASS_LEVEL_MAX }, (_, i) => ({
                  value: i + 1,
                  label: classLevelLabel(i + 1),
                }))}
                defaultGrade={grade}
                defaultSubjectId={subject?.id ?? 0}
                defaultFrom={today}
                defaultTo={`${new Date(today).getFullYear() + 1}-03-31`}
              />
            </div>
          </section>

          {classes.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-lg">
              <div className="px-4 py-2.5 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900 text-sm">
                  すべてのクラス
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {classes.length}件
                  </span>
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400">
                    <th className="text-left font-medium px-4 py-1.5">クラス</th>
                    <th className="text-left font-medium px-2 py-1.5 w-28">週コマ数</th>
                    <th className="text-left font-medium px-2 py-1.5">曜日・コマ</th>
                    <th className="text-right font-medium px-2 py-1.5 w-20">在籍</th>
                    <th className="text-left font-medium px-2 py-1.5 w-44">有効期間</th>
                    <th className="px-4 py-1.5 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => {
                    const ended = c.toDate < today;
                    const n = memberCount(c.id, enrollments);
                    const over = c.capacity > 0 && n > c.capacity;
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-slate-100 ${ended ? "opacity-50" : ""}`}
                      >
                        <td className="px-4 py-1.5 text-slate-900">
                          {c.name}
                          {ended && (
                            <span className="ml-2 text-[10px] text-slate-400 border border-slate-200 rounded px-1">
                              終了
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <form action={setClassSlots} className="flex items-center gap-1">
                            <input type="hidden" name="classGroupId" value={c.id} />
                            <input
                              name="slotsPerWeek"
                              type="number"
                              min={0}
                              max={20}
                              defaultValue={c.slotsPerWeek}
                              aria-label={`${c.name}の週コマ数`}
                              className="w-12 border border-slate-200 rounded px-1 py-0.5 text-sm text-right tabular-nums"
                            />
                            <span className="text-[10px] text-slate-400">
                              {c.slotsPerWeek === 0 ? "開講しない" : "コマ"}
                            </span>
                            <button
                              type="submit"
                              className="px-1.5 py-0.5 text-[10px] border border-slate-200 rounded hover:bg-slate-50"
                            >
                              保存
                            </button>
                          </form>
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 text-xs">
                          {c.slotsPerWeek === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : c.sessions.length === 0 ? (
                            <span className="text-slate-400">未定</span>
                          ) : (
                            scheduleLabel(c.sessions)
                          )}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            over ? "text-rose-600 font-bold" : "text-slate-900"
                          }`}
                        >
                          {n}
                          {c.capacity > 0 && (
                            <span className="text-slate-400">/{c.capacity}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 text-xs">
                          {c.fromDate} 〜 {c.toDate}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          {!ended && (
                            <form action={closeClassGroup}>
                              <input type="hidden" name="classId" value={c.id} />
                              <input type="hidden" name="toDate" value={today} />
                              <button
                                type="submit"
                                title="今日で終了にします（消しません）"
                                className="text-[11px] text-slate-400 hover:text-rose-600"
                              >
                                終了する
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">集団は1クラスに講師1人です。</b>
          生徒が5人でも20人でも変わりません。
          <b className="text-slate-700">開講しているクラスの数</b>
          がそのまま必要な講師数になります。
        </p>
        <p>
          <b className="text-slate-700">組み直すときはクラスを消さず、終了させてください。</b>
          消すと過去の授業記録と辻褄が合わなくなります。
          人数が増えて分割するときは、古いクラスを終了して新しく作ります。
        </p>
        <p>
          <b className="text-slate-700">振り分けは人が決めます。</b>
          誰をどのレベルに入れるかは、本人の希望や保護者との相談が絡む判断なので、
          システムは記録するだけにしています。
        </p>
      </div>
    </div>
  );
}
