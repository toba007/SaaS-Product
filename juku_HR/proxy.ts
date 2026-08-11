import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Next.js 16 では middleware は proxy に改名された（機能は同じ）。
 *
 * ここでやるのは楽観的なチェックだけ。Cookie があるかどうかしか見ない。
 * proxy は prefetch を含む全リクエストで走るので、ここで DB を引くと重いうえ、
 * Cookie は署名を検証していないので防御としても不十分。
 * 本当の認可は lib/dal.ts の currentTeacher() が DB を引いて行う。
 */
const PUBLIC = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 打刻ページ /p/[token] は二次元コードから開くのでログイン不要
  if (pathname.startsWith("/p/")) return NextResponse.next();

  // カレンダー購読 /api/ics/[token] も同じ。カレンダーアプリが取りに来るので
  // ログイン画面へ飛ばすと、向こう側では理由の分からないエラーにしかならない。
  // 本人確認は URL のトークンで行う。
  if (pathname.startsWith("/api/ics/")) return NextResponse.next();

  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  if (!hasCookie && !isPublic) {
    const url = new URL("/login", request.url);
    // ログイン後に元の画面へ戻せるようにする
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ここで「Cookie があるならログイン画面から追い出す」ことはしない。
  // Cookie の有無しか見ていないので、署名は正しいが講師がもう居ない（退職した・
  // DB を作り直した）Cookie を持った人を弾いてしまう。その人は DAL に
  // ログイン画面へ送り返されるので、proxy と DAL で押し合ってループになる。
  // ログイン済みかどうかの判断は、DB を引ける /login 側で行う。

  return NextResponse.next();
}

export const config = {
  // 静的ファイルと画像最適化は素通しする
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
