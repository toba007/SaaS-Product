"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 講師側スマホ画面の下タブ。入れる機能はこの5つだけ。
 *
 * 「提出」と「確定」は同じシフトの話だが、別のタブに分けている。
 * 希望を入れる場所と、決まったことを見る場所を1つのカレンダーに重ねると、
 * 今見ているのがどちらなのか分からなくなるため。
 */
const TABS = [
  { seg: "", label: "提出", icon: "📅" },
  { seg: "schedule", label: "確定", icon: "✅" },
  { seg: "lessons", label: "授業記録", icon: "📝" },
  { seg: "messages", label: "連絡", icon: "✉️" },
  { seg: "payslip", label: "給与", icon: "¥" },
];

export function TeacherTabs({
  unread,
  unreadComments,
}: {
  unread: number;
  unreadComments: number;
}) {
  const pathname = usePathname();
  const base = "/t";

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex max-w-md mx-auto">
        {TABS.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const active = t.seg
            ? pathname.startsWith(href)
            : pathname === base;
          return (
            <li key={t.seg} className="flex-1">
              <Link
                href={href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                  active ? "text-indigo-600 font-medium" : "text-slate-400"
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
                {((t.seg === "messages" && unread > 0) ||
                  (t.seg === "schedule" && unreadComments > 0)) && (
                  <span className="absolute top-1.5 right-1/2 translate-x-4 bg-rose-500 text-white text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                    {t.seg === "messages" ? unread : unreadComments}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
