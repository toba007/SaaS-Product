import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/app/components/StatusBadge";
import { CARD_STATUS, formatDateJP } from "@/lib/constants";

export const metadata = { title: "欠席者カード｜塾HR" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "未渡し" },
  { key: "delivered", label: "受渡済" },
  { key: "all", label: "すべて" },
];

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "pending";

  const where =
    tab === "pending"
      ? { status: { not: CARD_STATUS.DELIVERED } }
      : tab === "delivered"
        ? { status: CARD_STATUS.DELIVERED }
        : {};

  const cards = await prisma.absenceCard.findMany({
    where,
    include: {
      student: true,
      teacher: true,
      lesson: { include: { subject: true, period: true } },
    },
    orderBy: [{ lesson: { date: "desc" } }, { studentId: "asc" }],
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">欠席者カード</h1>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/cards?tab=${t.key}`}
            className={`px-3 py-1.5 text-sm rounded border ${
              tab === t.key
                ? "bg-slate-900 border-slate-900 text-white font-medium"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          該当するカードはありません
        </p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {cards.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cards/${c.id}`}
                className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <span className="text-xs text-slate-500 w-20 shrink-0">
                  {formatDateJP(c.lesson.date)}
                </span>
                <span className="text-sm font-medium text-slate-900 w-28 shrink-0 truncate">
                  {c.student.name}
                </span>
                <span className="text-xs text-slate-500 w-10 shrink-0">
                  {c.student.grade}
                </span>
                <span className="text-xs text-slate-600 w-12 shrink-0">
                  {c.lesson.subject.name}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  {c.progress || "内容がまだ書かれていません"}
                </span>
                <span className="ml-auto text-xs shrink-0">
                  <StatusBadge status={c.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
