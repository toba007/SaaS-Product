import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/app/components/PrintButton";
import { absoluteUrl, qrSvg } from "@/lib/qr";
import { EMPLOYMENT_LABEL } from "@/lib/constants";

export const metadata = { title: "打刻カード｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 講師に配る二次元コードのカード。
 * 講師が自分のスマホで読めば打刻できるので、教室に専用端末を置かなくてよい。
 */
export default async function QrCardsPage() {
  const teachers = await prisma.teacher.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });

  const cards = await Promise.all(
    teachers.map(async (t) => {
      const url = await absoluteUrl(`/p/${t.punchToken}`);
      return { teacher: t, url, svg: await qrSvg(url, 140) };
    }),
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex items-start justify-between gap-4">
        <div>
          <Link
            href="/attendance/kiosk"
            className="text-sm text-indigo-600 hover:underline"
          >
            ← 打刻画面
          </Link>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            打刻用の二次元コード
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            印刷して講師に配ります。自分のスマホで読めば打刻できます。
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="print-area grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(({ teacher, url, svg }) => (
          <div
            key={teacher.id}
            className="bg-white border border-slate-300 rounded-lg p-3 text-center break-inside-avoid"
          >
            <div className="text-[10px] text-slate-400 border-b border-slate-200 pb-1 mb-2">
              塾HR 打刻カード
            </div>
            <div
              className="flex justify-center [&>svg]:w-32 [&>svg]:h-32"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="mt-2">
              <div className="font-bold text-slate-900 text-sm">
                {teacher.name}
              </div>
              <div className="text-[10px] text-slate-400">
                {EMPLOYMENT_LABEL[teacher.employment]}
              </div>
            </div>
            <div className="no-print mt-1.5 text-[9px] text-slate-300 break-all">
              {url}
            </div>
          </div>
        ))}
      </div>

      <p className="no-print text-xs text-slate-500">
        二次元コードは今アクセスしているホスト（{cards[0]?.url.split("/p/")[0]}）を指しています。
        講師のスマホから読む場合は、同じネットワークから届くアドレスで開いてください。
      </p>
    </div>
  );
}
