import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cycleStudentSubject } from "./actions";
import {
  GRADES,
  LESSON_STYLE,
  indivSizeOf,
  lessonStyleLabel,
  lessonStyleShort,
  lessonStyles,
} from "@/lib/constants";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "受講科目｜塾HR" };
export const dynamic = "force-dynamic";

/** マスに出す短い記号 */
const MARK: Record<string, string> = {
  GROUP: "集",
  INDIV_1: "1",
  INDIV_2: "2",
};

export default async function StudentSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const sp = await searchParams;

  const [allStudents, subjects, links, setting] = await Promise.all([
    prisma.student.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.studentSubject.findMany({ where: { active: true } }),
    getSetting(),
  ]);

  // 個別で選べる形態は塾の設定で決まる（1対4まで見る塾なら4つ出る）
  const indivList = lessonStyles(setting.indivMaxStudents).filter(
    (st) => st !== LESSON_STYLE.GROUP,
  );

  // 生徒が多いと1画面に収まらないので学年で絞る
  const grades = GRADES.filter((g) => allStudents.some((s) => s.grade === g));
  const grade = grades.includes(sp.grade as (typeof GRADES)[number])
    ? sp.grade!
    : (grades[0] ?? "");
  const students = allStudents.filter((s) => s.grade === grade);

  const formatOf = (studentId: number, subjectId: number) =>
    links.find((l) => l.studentId === studentId && l.subjectId === subjectId)?.format ??
    null;

  const groupCount = links.filter((l) => l.format === LESSON_STYLE.GROUP).length;
  const indivCount = links.length - groupCount;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">受講科目</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          入塾のときに聞いた「何を取るか」を登録します。ここが集団のクラス分けの出発点です。
        </p>
      </div>

      {subjects.length === 0 || allStudents.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {subjects.length === 0 ? "科目" : "生徒"}が登録されていません。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">学年</span>
            {grades.map((g) => (
              <Link
                key={g}
                href={`/students/subjects?grade=${encodeURIComponent(g)}`}
                className={`px-2.5 py-1 text-sm rounded ${
                  g === grade
                    ? "bg-indigo-600 text-white font-medium"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {g}
              </Link>
            ))}
            <span className="ml-2 text-[11px] text-slate-400">
              全体: 集団 {groupCount}件 / 個別 {indivCount}件
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-40">
                    生徒（{grade}）
                  </th>
                  {subjects.map((s) => (
                    <th
                      key={s.id}
                      className="border-b border-slate-200 px-1 py-1.5 text-xs font-medium text-slate-600 w-14"
                    >
                      {s.name}
                    </th>
                  ))}
                  <th className="border-b border-l-2 border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 w-16">
                    科目数
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const mine = links.filter((l) => l.studentId === st.id);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/60">
                      <th className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1 text-left font-normal">
                        <div className="text-sm text-slate-900 truncate">{st.name}</div>
                        <div className="text-[10px] text-slate-400">{st.school}</div>
                      </th>

                      {subjects.map((s) => {
                        const f = formatOf(st.id, s.id);
                        return (
                          <td
                            key={s.id}
                            className="border-b border-slate-100 p-0 text-center"
                          >
                            <form action={cycleStudentSubject}>
                              <input type="hidden" name="studentId" value={st.id} />
                              <input type="hidden" name="subjectId" value={s.id} />
                              <button
                                type="submit"
                                title={`${st.name} / ${s.name}：${
                                  f ? lessonStyleShort(f) : "受講しない"
                                }（押すと変わります）`}
                                className={`w-full h-8 text-xs leading-none ${cellClass(f)}`}
                              >
                                {f ? MARK[f] : ""}
                              </button>
                            </form>
                          </td>
                        );
                      })}

                      <td className="border-b border-slate-100 border-l-2 border-l-slate-300 px-2 py-1 text-center">
                        <span
                          className={`text-sm tabular-nums ${
                            mine.length === 0 ? "text-slate-300" : "text-slate-900"
                          }`}
                        >
                          {mine.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              <Legend cls="bg-slate-50 text-slate-300">　</Legend> 受講しない
            </span>
            <span>
              <Legend cls="bg-indigo-600 text-white">集</Legend> 集団
            </span>
            {indivList.map((style) => (
              <span key={style}>
                <Legend cls={cellClass(style).replace(/ hover:\S+/g, "")}>
                  {indivSizeOf(style)}
                </Legend>{" "}
                {lessonStyleLabel(style)}
              </span>
            ))}
            <span className="text-slate-400">マスを押すと順に変わります</span>
          </div>
        </>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">集団はこの後クラスに振り分けます。</b>
          ここで「集」にした生徒が
          <Link href="/classes" className="text-indigo-600 hover:underline mx-1">
            クラス編成
          </Link>
          の振り分け対象になります。学年 × 科目 × レベルのクラスに入れてください。
        </p>
        <p>
          <b className="text-slate-700">集団と個別で必要な講師数の出方が違います。</b>
          集団は生徒が何人いてもクラスに講師1人。個別は
          <b className="text-slate-700">生徒数 ÷ 定員</b>
          で人数が決まります。
        </p>
        <p>
          <b className="text-slate-700">やめた科目は記録として残ります。</b>
          「受講しない」に戻しても行は消さず、過去の授業記録と辻褄が合うようにしています。
        </p>
      </div>
    </div>
  );
}

/**
 * 個別は人数が増えるほど薄くする。1対1 がいちばん濃い。
 * 塾によって上限が違う（1対4まで、など）ので、色は段階ではなく人数から決める。
 */
const INDIV_TONE = [
  "bg-sky-100 text-sky-700 font-bold hover:bg-sky-200",
  "bg-sky-50 text-sky-600 font-bold hover:bg-sky-100",
  "bg-sky-50/60 text-sky-500 font-bold hover:bg-sky-100",
];

function cellClass(format: string | null): string {
  if (format === LESSON_STYLE.GROUP)
    return "bg-indigo-600 text-white font-bold hover:bg-indigo-700";
  const n = format ? indivSizeOf(format) : null;
  if (n !== null) return INDIV_TONE[Math.min(n, INDIV_TONE.length) - 1];
  return "bg-slate-50 text-slate-300 hover:bg-slate-100";
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-sm align-middle text-[10px] ${cls}`}
    >
      {children}
    </span>
  );
}
