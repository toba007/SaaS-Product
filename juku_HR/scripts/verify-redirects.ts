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

  console.log("\n[8] 担当科目の画面は管理者だけ");
  // 講師が自分の担当科目を書き換えられると、入りたいコマに入れるようになってしまう
  check("講師は開けない", await follow("/teachers/subjects", mintCookie(teacher.id)), "/t");
  check(
    "管理者は開ける",
    await follow("/teachers/subjects", mintCookie(admin.id)),
    "/teachers/subjects",
  );

  // 描画まで通っているか（500 だと follow は "(500)" を返すので上で落ちる）
  const html = await (
    await fetch(`${BASE}/teachers/subjects`, { headers: { cookie: mintCookie(admin.id) } })
  ).text();
  check("科目名が出る", html.includes("英語") && html.includes("理科"), true);
  check("担当できる講師の集計が出る", html.includes("担当できる講師"), true);

  console.log("\n[9] シフト計画・勤務上限も管理者だけ");
  for (const path of ["/shifts/plans", "/shifts/rules"]) {
    check(`講師は ${path} を開けない`, await follow(path, mintCookie(teacher.id)), "/t");
    check(`管理者は ${path} を開ける`, await follow(path, mintCookie(admin.id)), path);
  }

  // 計画の詳細（必要人数の設定）まで描画が通るか。無ければ作って確かめる。
  const plan =
    (await prisma.shiftPlan.findFirst()) ??
    (await prisma.shiftPlan.create({
      data: { name: "検証用", fromDate: "2026-09-01", toDate: "2026-09-07" },
    }));
  const detail = `/shifts/plans/${plan.id}`;
  check("計画の詳細が開ける", await follow(detail, mintCookie(admin.id)), detail);

  const detailHtml = await (
    await fetch(BASE + detail, { headers: { cookie: mintCookie(admin.id) } })
  ).text();
  check(
    "需要と供給の対比が出る",
    detailHtml.includes("必要人数と、集まっている希望"),
    true,
  );
  check("一括入力のフォームが出る", detailHtml.includes("まとめて入れる"), true);
  check("自動作成の欄が出る", detailHtml.includes("自動作成"), true);

  console.log("\n[10] 盤面は科目ビューになっている");
  {
    const board = "/shifts/board";
    check("講師は開けない", await follow(board, mintCookie(teacher.id)), "/t");
    check("管理者は開ける", await follow(board, mintCookie(admin.id)), board);

    const html = await (
      await fetch(BASE + board, { headers: { cookie: mintCookie(admin.id) } })
    ).text();
    check("科目の切り替えが出る", html.includes("科目"), true);
    check("操作の説明が出る", html.includes("未割当 → 割当 → 固定 → 未割当"), true);
    check("固定の凡例が出る", html.includes("作り直しても動かない"), true);

    // 科目を指定しても開けること（存在しないIDでも落ちない）
    check(
      "科目を指定して開ける",
      await follow(`${board}?subject=1`, mintCookie(admin.id)),
      `${board}?subject=1`,
    );
    check(
      "おかしな科目IDでも落ちない",
      await follow(`${board}?subject=99999`, mintCookie(admin.id)),
      `${board}?subject=99999`,
    );
  }

  console.log("\n[11] 受講科目とクラス編成");
  {
    for (const path of ["/students/subjects", "/classes"]) {
      check(`講師は ${path} を開けない`, await follow(path, mintCookie(teacher.id)), "/t");
      check(`管理者は ${path} を開ける`, await follow(path, mintCookie(admin.id)), path);
    }

    const classes = await (
      await fetch(`${BASE}/classes?grade=%E4%B8%AD1&subject=1`, {
        headers: { cookie: mintCookie(admin.id) },
      })
    ).text();
    check("振り分けの箱が出る", classes.includes("未配属"), true);
    check(
      "ドラッグの案内が出る",
      classes.includes("生徒をドラッグしてレベル別のクラスに振り分けます"),
      true,
    );
    // ドラッグの取っ手。生徒が1人でも出ていれば付いている。
    check("生徒がつまめる", classes.includes("⠿"), true);
    check("クラス作成のフォームが出る", classes.includes("クラスを作る"), true);
    // 「月曜は英英数」のように同じ日に複数コマ入るので、コマは複数選べる
    check("コマを複数選べる", classes.includes("コマ（複数可）"), true);

    const subjects = await (
      await fetch(`${BASE}/students/subjects`, {
        headers: { cookie: mintCookie(admin.id) },
      })
    ).text();
    check("受講科目の表が出る", subjects.includes("受講科目"), true);
    check("形態の凡例が出る", subjects.includes("個別 1対2"), true);
  }
  // 準備ができていない計画では、ボタンではなく理由が出る
  check(
    "実行できない理由が出る",
    detailHtml.includes("まだ実行できません") ||
      detailHtml.includes("自動作成する（作り直し）"),
    true,
  );

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
