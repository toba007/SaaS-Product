import { Sidebar } from "../components/Sidebar";
import { requireAdmin } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * 管理者側の画面の枠。
 * ここで requireAdmin() を通しているので、配下のページは管理者しか開けない。
 * 講師が URL を直接叩いても講師画面へ送られる。
 */
export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar name={admin.name} />
      <main className="flex-1 min-w-0 px-4 py-5 md:px-6 md:py-6">{children}</main>
    </div>
  );
}
