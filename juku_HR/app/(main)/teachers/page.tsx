import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ResetPassword } from "./ResetPassword";
import { EMPLOYMENT_LABEL, ROLE, ROLE_LABEL } from "@/lib/constants";

export const metadata = { title: "講師・ログインID｜塾HR" };
export const dynamic = "force-dynamic";

/** 講師のログインIDと役割の一覧。パスワードは再発行しかできない。 */
export default async function TeachersPage() {
  const teachers = await prisma.teacher.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">講師</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          ログインIDと役割の一覧です。管理者も講師も同じログイン画面から入ります。
        </p>
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium px-4 py-2">講師</th>
              <th className="text-left font-medium px-2 py-2">ログインID</th>
              <th className="text-left font-medium px-2 py-2">役割</th>
              <th className="text-left font-medium px-2 py-2">入る画面</th>
              <th className="text-left font-medium px-4 py-2">パスワード</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <div className="text-slate-900">{t.name}</div>
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
                <td className="px-4 py-2">
                  <ResetPassword teacherId={t.id} name={t.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
