"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";

type Item = { href?: string; label: string };
type Section = {
  title: string;
  icon: Icon;
  items: Item[];
  /** 子が1つだけの見出し。開かずにそのまま飛ばす */
  single?: boolean;
};

// ---------- 見出しのしるし ----------
// 項目が増えると文字だけでは探しにくい。形で当たりを付けられるようにする。

type Icon = (props: { className?: string }) => React.ReactElement;

function Svg({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

const IconHome: Icon = (p) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
);
const IconCalendar: Icon = (p) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="m9 15 2 2 4-4" />
  </Svg>
);
const IconClock: Icon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const IconChat: Icon = (p) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
  </Svg>
);
const IconStudents: Icon = (p) => (
  <Svg {...p}>
    <path d="m12 4 9 4-9 4-9-4 9-4Z" />
    <path d="M7 10.5V15c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5" />
  </Svg>
);
const IconBook: Icon = (p) => (
  <Svg {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5v-15Z" />
    <path d="M4 17h15" />
  </Svg>
);
const IconTeacher: Icon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
  </Svg>
);
const IconCog: Icon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </Svg>
);

// ---------- 項目 ----------

const SECTIONS: Section[] = [
  {
    title: "ダッシュボード",
    icon: IconHome,
    single: true,
    items: [{ href: "/", label: "ダッシュボード" }],
  },
  {
    title: "シフト",
    icon: IconCalendar,
    items: [
      { href: "/shifts/timetable", label: "開講時間割" },
      { href: "/shifts/plans", label: "シフト計画・必要人数" },
      { href: "/shifts/board", label: "調整＆確定" },
      { href: "/shifts", label: "希望の確認・代理入力" },
      { href: "/shifts/rules", label: "勤務上限" },
      { href: "/calendar", label: "塾の予定" },
    ],
  },
  {
    title: "勤怠・給与",
    icon: IconClock,
    items: [
      { href: "/attendance", label: "勤怠管理" },
      { href: "/payroll", label: "給与計算" },
      { href: "/payroll/settings", label: "給与設定" },
    ],
  },
  {
    title: "講師連絡",
    icon: IconChat,
    single: true,
    items: [{ href: "/messages", label: "講師連絡" }],
  },
  {
    title: "生徒",
    icon: IconStudents,
    items: [
      { href: "/students/subjects", label: "受講科目" },
      { href: "/students/schedule", label: "個別の受講予定" },
      { href: "/classes", label: "クラス編成" },
    ],
  },
  {
    title: "授業",
    icon: IconBook,
    items: [
      { href: "/lessons", label: "授業" },
      { href: "/cards", label: "欠席者カード" },
    ],
  },
  {
    title: "講師",
    icon: IconTeacher,
    items: [
      { href: "/teachers", label: "講師・ログインID" },
      { href: "/teachers/new", label: "講師を追加" },
      { href: "/teachers/subjects", label: "担当科目" },
    ],
  },
  {
    title: "塾の設定",
    icon: IconCog,
    items: [
      { href: "/settings/periods", label: "コマ・時間割" },
      { href: "/settings", label: "個別の人数・教室数" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /shifts が /shifts/board まで拾わないようにする
  if (href === "/shifts") return pathname === "/shifts";
  // /teachers が /teachers/subjects まで拾わないようにする
  if (href === "/teachers") return pathname === "/teachers";
  // /settings/periods を開いているときに「個別の人数・教室数」まで光らせない
  if (href === "/settings") return pathname === "/settings";
  if (href === "/payroll") return pathname === "/payroll" || /^\/payroll\/\d+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasActive(section: Section, pathname: string): boolean {
  return section.items.some((i) => i.href && isActive(pathname, i.href));
}

export function Sidebar({ name }: { name: string }) {
  const pathname = usePathname();

  /**
   * 手で開け閉めしたぶんだけ覚える。
   * 触っていない見出しは「いま開いているページを含むかどうか」で決まるので、
   * 別のページへ移ると、そのページの見出しが自動で開く。
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (s: Section) => toggled[s.title] ?? hasActive(s, pathname);

  return (
    <aside className="no-print md:w-56 md:shrink-0 md:border-r border-b md:border-b-0 border-slate-200 bg-white">
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

        {/*
          画面が狭いときは横に流す。
          折りたたみは縦に並んでいるから意味があるもので、
          横一列で開け閉めさせても押しにくいだけになる。
        */}
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 py-2">
          {SECTIONS.flatMap((s) => s.items).map((item) =>
            item.href ? (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${
                  isActive(pathname, item.href)
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ) : null,
          )}
        </nav>

        <nav className="hidden md:block flex-1 overflow-y-auto px-2 py-1">
          <ul className="space-y-0.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const active = hasActive(section, pathname);

              // 子が1つだけの見出しは、開かずにそのまま飛ばす
              if (section.single) {
                const href = section.items[0].href!;
                return (
                  <li key={section.title}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                        active
                          ? "bg-indigo-50 text-indigo-700 font-medium"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{section.title}</span>
                    </Link>
                  </li>
                );
              }

              const open = isOpen(section);
              const panelId = `nav-${section.title}`;

              return (
                <li key={section.title}>
                  <button
                    type="button"
                    onClick={() =>
                      setToggled((t) => ({ ...t, [section.title]: !open }))
                    }
                    aria-expanded={open}
                    aria-controls={panelId}
                    className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                      active
                        ? "text-indigo-700 font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{section.title}</span>
                    <Chevron open={open} />
                  </button>

                  {open && (
                    <ul
                      id={panelId}
                      className="mt-0.5 mb-1 space-y-0.5 border-l border-slate-200 ml-[1.15rem] pl-2"
                    >
                      {section.items.map((item) => {
                        if (!item.href) {
                          return (
                            <li key={item.label}>
                              <span className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-300 cursor-default">
                                {item.label}
                                <span className="ml-auto text-[10px] border border-slate-200 rounded px-1">
                                  未
                                </span>
                              </span>
                            </li>
                          );
                        }
                        const on = isActive(pathname, item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={on ? "page" : undefined}
                              className={`block rounded-md px-2.5 py-1.5 text-[13px] ${
                                on
                                  ? "bg-indigo-50 text-indigo-700 font-medium"
                                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`ml-auto w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
