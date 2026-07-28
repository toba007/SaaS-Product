import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "塾HR",
  description: "講師のシフト・勤怠・給与計算・講師連絡",
};

/**
 * ここは html/body だけ。画面の枠（サイドバー）は (main) 側で付ける。
 * 二次元コードから開く打刻ページ /p/[token] は講師のスマホで開くので、枠を出さない。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
