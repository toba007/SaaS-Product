import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LoginForm } from "./LoginForm";
import { currentTeacher } from "@/lib/dal";
import { homeFor } from "@/lib/constants";

export const metadata: Metadata = { title: "ログイン｜塾HR" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // 本当にログイン済みの人だけを振り分ける。
  // ここは DB を引くので、Cookie は持っているが講師がもう居ない場合は
  // ログイン画面のままになる（proxy と押し合ってループしない）。
  const teacher = await currentTeacher();
  if (teacher) redirect(homeFor(teacher.role));

  const sp = await searchParams;
  // 外部サイトへ飛ばされないように、自分のサイト内のパスだけ引き継ぐ
  const next =
    sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//")
      ? sp.next
      : "";

  const isDev = process.env.NODE_ENV === "development";
  const host = isDev ? ((await headers()).get("host") ?? "") : "";

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-900">
            塾<span className="text-indigo-600">HR</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            管理者・講師とも、このIDとパスワードで入ります
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <LoginForm next={next} />
        </div>

        {isDev ? <DevHint host={host} /> : (
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            IDがわからないときは教室にお問い合わせください
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 開発中だけ出す案内。
 * 管理者画面と講師画面を並べて見たいとき、同じホストの別タブだと Cookie を共有してしまい、
 * 片方でログインするともう片方も同じ人になってしまう。Cookie はホスト名で分かれる
 * （ポート番号では分かれない）ので、ホスト名を変えれば別々にログインできる。
 */
function DevHint({ host }: { host: string }) {
  const port = host.split(":")[1] ?? "3000";
  const hostname = host.split(":")[0];

  const targets = [
    { name: "admin.localhost", label: "管理者用", who: "sato" },
    { name: "teacher.localhost", label: "講師用", who: "takahashi" },
  ];

  return (
    <div className="bg-white border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
      <div className="text-[10px] font-medium text-slate-400">
        開発用の案内（本番では出ません）
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        管理者画面と講師画面を並べて見るときは、
        <b className="text-slate-700">ホスト名を分けて</b>
        ください。同じホストの別タブだとログインを共有してしまいます
        （ポート番号を変えても分かれません）。
      </p>

      <div className="space-y-1">
        {targets.map((t) => {
          const active = hostname === t.name;
          return (
            <a
              key={t.name}
              href={`http://${t.name}:${port}/login`}
              className={`flex items-baseline gap-2 rounded px-2 py-1.5 text-[11px] border ${
                active
                  ? "bg-indigo-50 border-indigo-200"
                  : "bg-slate-50 border-slate-200 hover:border-indigo-300"
              }`}
            >
              <span className="font-medium text-slate-700">{t.label}</span>
              <span className="font-mono text-slate-500">
                {t.name}:{port}
              </span>
              <span className="ml-auto text-slate-400">{t.who}</span>
              {active && <span className="text-indigo-600">← 今ここ</span>}
            </a>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        seed のパスワードは全員{" "}
        <code className="font-mono select-all text-slate-600">juku-hr-demo-2026</code>
        。管理者は <code className="font-mono">sato</code>{" "}
        <code className="font-mono">suzuki</code>、講師は{" "}
        <code className="font-mono">takahashi</code> など。
      </p>
    </div>
  );
}
