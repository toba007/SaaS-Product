/**
 * デモ用パスワードが「既知の流出パスワード」でないことを確かめる。
 *   npm run check:password
 *   npm run check:password -- 試したいパスワード
 *
 * ブラウザ（Chrome のパスワードチェックなど）は、入力されたパスワードを
 * 流出済み一覧と突き合わせて「データ侵害で検出されました」と警告を出す。
 * デモ中にこれが出ると、アプリが侵害されたように見えてしまう。
 *
 * 照会は Have I Been Pwned の Pwned Passwords。SHA-1 の先頭5文字だけを送り、
 * 残りは手元で突き合わせるので、パスワードそのものはネットワークに出ない（k-匿名性）。
 */
import { createHash } from "node:crypto";

/** seed が使うデモ用パスワード。prisma/seed.ts の DEMO_PASSWORD と合わせること。 */
const DEMO_PASSWORD = "juku-hr-demo-2026";

async function pwnedCount(password: string): Promise<number> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    // 応答の長さから中身を推測されないようにパディングを頼む
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`HIBP の応答が ${res.status} でした`);

  for (const line of (await res.text()).split("\n")) {
    const [suf, count] = line.trim().split(":");
    if (suf === suffix) return Number(count);
  }
  return 0;
}

async function main() {
  const targets = process.argv.slice(2);
  const list = targets.length > 0 ? targets : [DEMO_PASSWORD];

  let bad = 0;
  for (const password of list) {
    let count: number;
    try {
      count = await pwnedCount(password);
    } catch (e) {
      console.error(
        `  ?  ${JSON.stringify(password)} — 照会できませんでした（${(e as Error).message}）`,
      );
      console.error("     ネットワークにつながらない場合は確認できません。");
      process.exit(2);
    }

    if (count === 0) {
      console.log(`  OK  ${JSON.stringify(password)} — 流出リストにありません`);
    } else {
      bad++;
      console.log(
        `  NG  ${JSON.stringify(password)} — ${count.toLocaleString()}件の流出で確認されています`,
      );
      console.log("      ブラウザが「データ侵害で検出されました」と警告します。別の値にしてください。");
    }
  }

  console.log(
    bad === 0
      ? "\n✅ 問題なし"
      : `\n❌ ${bad}件が流出済みです`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

main();
