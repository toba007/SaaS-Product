"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

type Item = { href?: string; label: string };
type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "",
    items: [{ href: "/", label: "ダッシュボード" }],
  },
  {
    title: "シフト",
    items: [
      { href: "/shifts/board", label: "調整＆確定" },
      { href: "/shifts", label: "希望の確認・代理入力" },
      { href: "/calendar", label: "塾の予定" },
    ],
  },
  {
    title: "勤怠・給与",
    items: [
      { href: "/attendance", label: "勤怠管理" },
      { href: "/payroll", label: "給与計算" },
      { href: "/payroll/settings", label: "給与設定" },
    ],
  },
  {
    title: "連絡",
    items: [{ href: "/messages", label: "講師連絡" }],
  },
  {
    title: "授業",
    items: [
      { href: "/lessons", label: "授業" },
      { href: "/cards", label: "欠席者カード" },
    ],
  },
  {
    title: "講師",
    items: [{ href: "/teachers", label: "講師・ログインID" }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /shifts が /shifts/board まで拾わないようにする
  if (href === "/shifts") return pathname === "/shifts";
  if (href === "/payroll") return pathname === "/payroll" || /^\/payroll\/\d+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <aside className="no-print md:w-52 md:shrink-0 md:border-r border-b md:border-b-0 border-slate-200 bg-white">
      <div className="md:sticky md:top-0 md:h-dvh flex md:flex-col">
        <Link
          href="/"
          className="flex items-baseline gap-1.5 h-14 px-4 shrink-0"
        >
          <span className="font-bold text-slate-900">
            塾<span className="text-indigo-600">HR</span>
          </span>
          <span className="text-[10px] text-slate-400">管理者</span>
        </Link>

        <nav className="flex md:flex-col gap-4 md:gap-5 overflow-x-auto md:overflow-visible px-3 py-2 md:py-1">
          {SECTIONS.map((section, i) => (
            <div key={i} className="shrink-0">
              {section.title && (
                <div className="hidden md:block px-2 pb-1 text-[11px] font-medium text-slate-400">
                  {section.title}
                </div>
              )}
              <ul className="flex md:flex-col gap-1">
                {section.items.map((item) => {
                  if (!item.href) {
                    return (
                      <li key={item.label}>
                        <span className="flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-slate-300 cursor-default">
                          {item.label}
                          <span className="ml-auto text-[10px] border border-slate-200 rounded px-1">
                            未
                          </span>
                        </span>
                      </li>
                    );
                  }
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${
                          active
                            ? "bg-indigo-50 text-indigo-700 font-medium"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden md:block mt-auto p-3 border-t border-slate-100">
          <div className="text-xs text-slate-600 truncate">{name}</div>
          <form action={logout}>
            <button
              type="submit"
              className="text-[11px] text-slate-400 hover:text-slate-700 mt-0.5"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
