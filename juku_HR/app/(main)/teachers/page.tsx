import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentTeacher } from "@/lib/dal";
import { ResetPassword } from "./ResetPassword";
import { RemoveTeacher, RestoreTeacher } from "./RemoveTeacher";
import { EMPLOYMENT_LABEL, ROLE, ROLE_LABEL } from "@/lib/constants";

export const metadata = { title: "講師・ログインID｜塾HR" };
export const dynamic = "force-dynamic";

/** 講師にぶら下がっている記録の件数。0 のときだけ完全に削除できる。 */
const RECORD_COUNTS = {
  lessons: true,
  cards: true,
  requests: true,
  assignments: true,
  punches: true,
  duties: true,
  adminWorks: true,
  messages: true,
  shiftComments: true,
  sentComments: true,
} as const;

/** 講師のログインIDと役割の一覧。パスワードは再発行しかできない。 */
export default async function TeachersPage() {
  const [teachers, me] = await Promise.all([
    prisma.teacher.findMany({
      orderBy: [{ active: "desc" }, { role: "asc" }, { id: "asc" }],
      include: { _count: { select: RECORD_COUNTS } },
    }),
    currentTeacher(),
  ]);

  const active = teachers.filter((t) => t.active);
  const retired = teachers.filter((t) => !t.active);
  const recordsOf = (t: (typeof teachers)[number]) =>
    Object.values(t._count).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">講師</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ログインIDと役割の一覧です。管理者も講師も同じログイン画面から入ります。
          </p>
        </div>
        <Link
          href="/teachers/new"
          className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 shrink-0"
        >
          講師を追加
        </Link>
      </div>

      <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
        パスワードはハッシュにして保存しているので、今の値を表示することはできません。
        忘れた講師には再発行して伝えてください。打刻用の二次元コード（
        <Link href="/attendance/qr" className="text-indigo-600 hover:underline">
          こちら
        </Link>
        ）はログイン不要で、打刻しかできません。
      </p>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">在籍中</h2>
          <span className="text-[11px] text-slate-400">{active.length}人</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium px-4 py-2">講師</th>
              <th className="text-left font-medium px-2 py-2">ログインID</th>
              <th className="text-left font-medium px-2 py-2">役割</th>
              <th className="text-left font-medium px-2 py-2">入る画面</th>
              <th className="text-left font-medium px-2 py-2">記録</th>
              <th className="text-left font-medium px-4 py-2">パスワード</th>
              <th className="text-left font-medium px-4 py-2 w-28">在籍</th>
            </tr>
          </thead>
          <tbody>
            {active.map((t) => {
              const records = recordsOf(t);
              return (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">
                    <div className="text-slate-900">
                      {t.name}
                      {me?.id === t.id && (
                        <span className="ml-1.5 text-[10px] text-slate-400">
                          (あなた)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {EMPLOYMENT_LABEL[t.employment]}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5 select-all">
                      {t.loginId}
                    </code>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        t.role === ROLE.ADMIN
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {ROLE_LABEL[t.role]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {t.role === ROLE.ADMIN ? "管理者画面（PC）" : "講師画面（スマホ）"}
                  </td>
                  <td className="px-2 py-2 text-xs tabular-nums text-slate-400">
                    {records === 0 ? "—" : `${records}件`}
                  </td>
                  <td className="px-4 py-2">
                    <ResetPassword teacherId={t.id} name={t.name} />
                  </td>
                  <td className="px-4 py-2">
                    <RemoveTeacher
                      teacherId={t.id}
                      name={t.name}
                      records={records}
                      isSelf={me?.id === t.id}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {retired.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">退職済み</h2>
            <span className="text-[11px] text-slate-400">{retired.length}人</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {retired.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-400">
                    {t.name}
                    <span className="ml-2 text-[10px]">
                      {EMPLOYMENT_LABEL[t.employment]}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <code className="text-xs bg-slate-50 text-slate-400 rounded px-1.5 py-0.5">
                      {t.loginId}
                    </code>
                  </td>
                  <td className="px-2 py-2 text-xs tabular-nums text-slate-400">
                    記録 {recordsOf(t)}件
                  </td>
                  <td className="px-4 py-2 w-28">
                    <RestoreTeacher teacherId={t.id} name={t.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
            退職にしても記録は消えません。過去の月の給与は今までどおり計算できます。
            ログインはできなくなり、シフトの割当対象からも外れます。
          </p>
        </div>
      )}
    </div>
  );
}
