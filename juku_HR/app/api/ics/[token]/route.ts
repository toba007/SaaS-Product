import { feedForToken } from "@/lib/ics-feed";

/**
 * 講師個人のカレンダー購読フィード。
 *
 * カレンダーアプリ（Googleカレンダー・iOS標準など）が定期的に取りに来る。
 * ログインは通らないので、URL に入っているトークンが本人確認そのものになる。
 * だから中身は「漏れても致命傷にならない範囲」に絞ってある（lib/ics-feed.ts）。
 *
 * proxy.ts でこのパスを素通しにしている。通していないとログイン画面へ飛ばされ、
 * カレンダーアプリ側は理由の分からないエラーになる。
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const feed = await feedForToken(token);

  // トークンが違う・退職している。どちらも同じ応答にして、当てずっぽうに情報を与えない。
  if (!feed) return new Response("Not Found", { status: 404 });

  return new Response(feed.ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="juku-hr.ics"',
      // 本人のシフトなので、途中の共有キャッシュに残させない
      "Cache-Control": "private, no-store",
    },
  });
}
