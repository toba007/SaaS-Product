import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cycleTeacherSubject } from "./actions";
import {
  coverage,
  levelMap,
  levelOf,
  teachersWithoutSubject,
} from "@/lib/subjects";
import {
  EMPLOYMENT_LABEL,
  SUBJECT_LEVEL,
  SUBJECT_LEVEL_LABEL,
  SUBJECT_LEVEL_MARK,
} from "@/lib/constants";

export const metadata = { title: "担当科目｜塾HR" };
export const dynamic = "force-dynamic";

export default async function TeacherSubjectsPage() {
  const [teachers, subjects, links] = await Promise.all([
    prisma.teacher.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.teacherSubject.findMany(),
  ]);

  const map = levelMap(links);
  const cov = coverage(subjects, links);
  const unset = teachersWithoutSubject(teachers, links);

  const uncovered = cov.filter((c) => c.uncovered);
  const single = cov.filter((c) => c.singlePoint);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/teachers" className="text-sm text-indigo-600 hover:underline">
          ← 講師・ログインID
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">担当科目</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          誰が何を教えられるかを登録します。自動作成はここを見て候補を絞ります。
        </p>
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          科目が1つも登録されていません。先に科目を登録してください。
        </p>
      ) : (
        <>
          {/* 自動作成が実行できなくなるので、これは最優先で出す */}
          {uncovered.length > 0 && (
            <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              担当できる講師がいない科目があります（
              {uncovered.map((c) => c.name).join("、")}
              ）。この科目に必要人数を設定すると、自動作成が実行できません。
            </p>
          )}

          {unset.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              担当科目が1件も登録されていない講師がいます（
              {unset.map((t) => t.name).join("、")}
              ）。このままだと自動作成の候補に一度も上がりません。
            </p>
          )}

          {single.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              担当できる講師が1人しかいない科目があります（
              {single.map((c) => c.name).join("、")}
              ）。その講師が休むとその科目の授業が成立しません。
            </p>
          )}

          {/* 講師 × 科目。押すたびに 未設定 → 可 → 得意 → 専門 → 未設定 と回る */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-40">
                    講師
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
                {teachers.map((t) => {
                  const mine = links.filter((l) => l.teacherId === t.id);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <th className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1 text-left font-normal">
                        <div className="text-sm text-slate-900 truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {EMPLOYMENT_LABEL[t.employment]}
                        </div>
                      </th>

                      {subjects.map((s) => {
                        const level = levelOf(map, t.id, s.id);
                        return (
                          <td
                            key={s.id}
                            className="border-b border-slate-100 p-0 text-center"
                          >
                            <form action={cycleTeacherSubject}>
                              <input type="hidden" name="teacherId" value={t.id} />
                              <input type="hidden" name="subjectId" value={s.id} />
                              <button
                                type="submit"
                                title={`${t.name} / ${s.name}：${
                                  SUBJECT_LEVEL_LABEL[level] ?? "担当しない"
                                }（押すと変わります）`}
                                className={`w-full h-8 text-sm leading-none ${cellClass(level)}`}
                              >
                                {SUBJECT_LEVEL_MARK[level] ?? ""}
                              </button>
                            </form>
                          </td>
                        );
                      })}

                      <td className="border-b border-slate-100 border-l-2 border-l-slate-300 px-2 py-1 text-center">
                        <span
                          className={`text-sm tabular-nums ${
                            mine.length === 0 ? "text-rose-600 font-bold" : "text-slate-900"
                          }`}
                        >
                          {mine.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 科目ごとに何人担当できるか。ここが1人の科目は運営上のリスク */}
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <th className="sticky left-0 z-10 bg-white border-r border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-500">
                    担当できる講師
                  </th>
                  {cov.map((c) => (
                    <td key={c.subjectId} className="px-1 py-1.5 text-center">
                      <span
                        className={`text-sm tabular-nums ${
                          c.uncovered
                            ? "text-rose-600 font-bold"
                            : c.singlePoint
                              ? "text-amber-600 font-bold"
                              : "text-slate-900"
                        }`}
                      >
                        {c.teacherCount}
                      </span>
                      {c.expertCount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          専門{c.expertCount}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="border-l-2 border-l-slate-300" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>
              <Legend cls="bg-slate-50 text-slate-300">　</Legend> 担当しない
            </span>
            <span>
              <Legend cls="bg-white text-slate-600 border border-slate-200">○</Legend> 可
            </span>
            <span>
              <Legend cls="bg-indigo-50 text-indigo-600">◎</Legend> 得意
            </span>
            <span>
              <Legend cls="bg-indigo-600 text-white">★</Legend> 専門
            </span>
            <span className="text-slate-400">マスを押すと順に変わります</span>
          </div>
        </>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">登録していない科目には割り当てません。</b>
          自動作成は「その科目を担当できる講師」の中からしか選ばないので、
          ここが埋まっていない講師はシフトに入りません。
        </p>
        <p>
          <b className="text-slate-700">習熟度は優先順位に使います。</b>
          公平性などの条件が同じくらいのとき、専門・得意の講師を先に割り当てます。
          「可」でも割り当ての対象にはなります。
        </p>
        <p>
          <b className="text-slate-700">担当できる講師が1人の科目は警告が出ます。</b>
          割当を止めるものではありませんが、その講師が休むと授業が成立しないので、
          採用や研修を考える材料にしてください。
        </p>
      </div>
    </div>
  );
}

function cellClass(level: number): string {
  if (level >= SUBJECT_LEVEL.EXPERT)
    return "bg-indigo-600 text-white font-bold hover:bg-indigo-700";
  if (level === SUBJECT_LEVEL.GOOD)
    return "bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100";
  if (level === SUBJECT_LEVEL.OK) return "bg-white text-slate-600 hover:bg-slate-100";
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
