import { requireAuth } from "@/lib/dal";
import { logout } from "@/app/login/actions";
import { prisma } from "@/lib/prisma";
import { TeacherTabs } from "./TeacherTabs";
import { unreadTotalForTeacher } from "@/lib/comments";
import { EMPLOYMENT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * 講師側の画面。スマホで見る前提なので、サイドバーは出さず下タブにする。
 * 誰であるかはセッションから決める。URL には講師を特定する値を入れない。
 */
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const teacher = await requireAuth("/t");

  const [unread, unreadComments] = await Promise.all([
    prisma.messageRecipient.count({
      where: { teacherId: teacher.id, readAt: null },
    }),
    unreadTotalForTeacher(teacher.id),
  ]);

  return (
    <div className="min-h-dvh bg-slate-50 pb-16">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 h-12 flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm">
            塾<span className="text-indigo-600">HR</span>
          </span>
          <span className="ml-auto text-sm text-slate-700">{teacher.name}</span>
          <span className="text-[10px] text-slate-400">
            {EMPLOYMENT_LABEL[teacher.employment]}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="text-[10px] text-slate-400 hover:text-slate-700 px-1"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-3">{children}</main>

      <TeacherTabs unread={unread} unreadComments={unreadComments} />
    </div>
  );
}
