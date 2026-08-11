import Link from "next/link";
import { AddTeacher } from "../AddTeacher";

export const metadata = { title: "講師を追加｜塾HR" };
export const dynamic = "force-dynamic";

export default function NewTeacherPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <Link href="/teachers" className="text-sm text-indigo-600 hover:underline">
          ← 講師の一覧へ
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mt-1">講師を追加</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          登録すると、その場でログインIDとパスワードが出ます。本人に伝えてください。
        </p>
      </div>

      <AddTeacher />

      <section className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">登録したあとに、あと3つ必要です。</b>
          どれも空のままだと、その講師はシフトにも給与にも出てきません。
        </p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>
            <Link href="/teachers/subjects" className="text-indigo-600 hover:underline">
              担当科目
            </Link>
            ── 登録が無いと、自動作成でどのコマにも割り当てられません
          </li>
          <li>
            <Link href="/shifts/rules" className="text-indigo-600 hover:underline">
              勤務上限
            </Link>
            ── 未設定なら既定値（1日4・週12・連続3）が使われます
          </li>
          <li>
            <Link href="/payroll/settings" className="text-indigo-600 hover:underline">
              給与の単価
            </Link>
            ── <b className="text-slate-700">未設定の形態で働いた日は0円で計算されます</b>
          </li>
        </ul>
      </section>
    </div>
  );
}
