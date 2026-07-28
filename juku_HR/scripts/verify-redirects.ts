/**
 * ログイン前後の行き先が正しいことを、動いている dev サーバーに対して確かめる。
 *   npm run dev を起動した状態で  npm run verify:http
 *
 * ここを確かめる理由:
 * proxy は Cookie の有無しか見ず、DAL は DB を引いて講師が実在し在籍中かまで見る。
 * この2つの判断が食い違うと、片方が /login へ送り、もう片方が / へ送り返してループする。
 * 実際、proxy に「Cookie があればログイン画面から追い出す」を入れていたときに
 * 退職者・古い Cookie でループが起きた。
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}` +
      (ok
        ? ""
        : `\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`),
  );
}

function mintCookie(teacherId: number, msFromNow = 60_000) {
  const exp = Date.now() + msFromNow;
  const payload = `${teacherId}.${exp}`;
  const sig = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("base64url");
  return `juku_session=${payload}.${sig}`;
}

/** リダイレクトを辿って、最終的に表示されたパスを返す。回りすぎたら "LOOP"。 */
async function follow(start: string, cookie?: string): Promise<string> {
  let url = start;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(BASE + url, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    if (!loc) return res.status === 200 ? url : `${url}(${res.status})`;
    url = loc.replace(BASE, "");
  }
  return "LOOP";
}

async function main() {
  const up = await fetch(BASE, { redirect: "manual" }).catch(() => null);
  if (!up) {
    console.error(`${BASE} が応答しません。先に npm run dev を起動してください。`);
    process.exit(1);
  }

  const admin = await prisma.teacher.findFirst({ where: { role: "ADMIN", active: true } });
  const teacher = await prisma.teacher.findFirst({ where: { role: "TEACHER", active: true } });
  if (!admin || !teacher) {
    console.error("講師データがありません。npm run seed を実行してください。");
    process.exit(1);
  }

  console.log("\n[1] 未ログインはログイン画面へ");
  check("/", await follow("/"), "/login");
  check("/payroll", await follow("/payroll"), "/login?next=%2Fpayroll");
  check("/t", await follow("/t"), "/login?next=%2Ft");

  console.log("\n[2] ログイン済みは役割どおりの画面へ");
  check("管理者が / を開く", await follow("/", mintCookie(admin.id)), "/");
  check("講師が / を開く", await follow("/", mintCookie(teacher.id)), "/t");
  check("講師が /payroll を開く", await follow("/payroll", mintCookie(teacher.id)), "/t");

  console.log("\n[3] ログイン済みがログイン画面を開いたら戻す");
  check("管理者", await follow("/login", mintCookie(admin.id)), "/");
  check("講師", await follow("/login", mintCookie(teacher.id)), "/t");

  console.log("\n[4] Cookie はあるが講師が居ない → ループせずログイン画面");
  // DB を作り直すと ID が変わるので、古い Cookie がこの状態になる
  const gone = mintCookie(999999);
  check("/ を開く", await follow("/", gone), "/login");
  check("/login を開く", await follow("/login", gone), "/login");
  check("/t を開く", await follow("/t", gone), "/login?next=%2Ft");

  console.log("\n[5] 退職した講師の Cookie → ループせずログイン画面");
  await prisma.teacher.update({ where: { id: teacher.id }, data: { active: false } });
  try {
    const c = mintCookie(teacher.id);
    check("/ を開く", await follow("/", c), "/login");
    check("/login を開く", await follow("/login", c), "/login");
  } finally {
    await prisma.teacher.update({ where: { id: teacher.id }, data: { active: true } });
  }

  console.log("\n[6] 壊れた Cookie → ループせずログイン画面");
  check("署名がでたらめ", await follow("/", "juku_session=1.9999999999999.aaaa"), "/login");
  check("期限切れ", await follow("/", mintCookie(admin.id, -1000)), "/login");

  console.log("\n[7] 打刻ページはログイン不要のまま");
  const t2 = await prisma.teacher.findFirst({ where: { active: true } });
  check(`/p/[token]`, await follow(`/p/${t2!.punchToken}`), `/p/${t2!.punchToken}`);

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
