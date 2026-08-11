/**
 * 講師の追加・退職・削除の判断を確かめる。
 *   npm run verify
 *
 * ここで守っているのは、起きてしまうと復旧が重い2つの事故。
 *
 *   1. **管理画面に入れる人がいなくなる** — 最後の管理者を退職にする、自分を外す。
 *      こうなると誰もログインできず、DBを直接触るしか戻す手が無い。
 *   2. **締めた月の給与が計算し直せなくなる** — 記録がある講師を消す。
 *      シフト・勤怠・給与がその講師にぶら下がっている。
 *
 * DB を使わない純粋関数なので、境界をまとめて固定しておく。
 */
import {
  LOGIN_ID_PATTERN,
  checkDelete,
  checkRetire,
  loginIdTakenError,
  removalMode,
  validateNewTeacher,
  type TeacherLite,
} from "../lib/teachers";
import { EMPLOYMENT, ROLE } from "../lib/constants";

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

const admin = (id: number, over: Partial<TeacherLite> = {}): TeacherLite => ({
  id,
  name: `管理者${id}`,
  role: ROLE.ADMIN,
  active: true,
  ...over,
});
const teacher = (id: number, over: Partial<TeacherLite> = {}): TeacherLite => ({
  id,
  name: `講師${id}`,
  role: ROLE.TEACHER,
  active: true,
  ...over,
});

// ============================================================
console.log("\n[追加] 入力の検査");
{
  const ok = validateNewTeacher({
    name: " 佐藤 健一 ",
    kana: "サトウ ケンイチ",
    loginId: "Sato_01",
    role: ROLE.TEACHER,
    employment: EMPLOYMENT.PART_TIME,
  });
  check("通る", ok.ok, true);
  // 前後の空白は落とす。空白付きで登録すると、本人が打っても一致しない。
  check("名前の空白を落とす", ok.ok && ok.value.name, "佐藤 健一");
  // 大文字で登録すると、本人が小文字で打って入れなくなる
  check("ログインIDを小文字に寄せる", ok.ok && ok.value.loginId, "sato_01");

  check("名前が空なら弾く", validateNewTeacher({ name: "", loginId: "abc" }).ok, false);
  check(
    "名前が空白だけでも弾く",
    validateNewTeacher({ name: "   ", loginId: "abc" }).ok,
    false,
  );
  check(
    "名前が41文字なら弾く",
    validateNewTeacher({ name: "あ".repeat(41), loginId: "abc" }).ok,
    false,
  );
  check(
    "名前が40文字なら通る",
    validateNewTeacher({ name: "あ".repeat(40), loginId: "abc" }).ok,
    true,
  );
}

console.log("\n[追加] ログインIDの形");
{
  const v = (loginId: string) => validateNewTeacher({ name: "名前", loginId }).ok;
  check("3文字は通る", v("abc"), true);
  check("2文字は弾く", v("ab"), false);
  check("20文字は通る", v("a".repeat(20)), true);
  check("21文字は弾く", v("a".repeat(21)), false);
  check("数字とアンダースコアは通る", v("sato_2026"), true);
  // 口頭で伝えることがあるので、紛れる文字は入れさせない
  check("記号は弾く", v("sato-01"), false);
  check("空白は弾く", v("sato 01"), false);
  check("日本語は弾く", v("さとう"), false);
  check("正規表現は大文字を通さない", LOGIN_ID_PATTERN.test("Sato"), false);
}

console.log("\n[追加] 役割と雇用区分");
{
  const v = (over: Record<string, string>) =>
    validateNewTeacher({ name: "名前", loginId: "abc", ...over }).ok;
  check("管理者は通る", v({ role: ROLE.ADMIN }), true);
  check("知らない役割は弾く", v({ role: "OWNER" }), false);
  check("社員は通る", v({ employment: EMPLOYMENT.FULL_TIME }), true);
  check("知らない雇用区分は弾く", v({ employment: "CONTRACT" }), false);
  // 省略時は、権限の弱いほうに倒す
  const d = validateNewTeacher({ name: "名前", loginId: "abc" });
  check("省略したら講師", d.ok && d.value.role, ROLE.TEACHER);
  check("省略したら時間講師", d.ok && d.value.employment, EMPLOYMENT.PART_TIME);
}

console.log("\n[追加] ログインIDの重複");
{
  // 退職者のIDを使い回すと、過去の記録がどちらのものか分からなくなる
  check(
    "在籍中との重複",
    loginIdTakenError("sato", true).includes("既に使われています"),
    true,
  );
  check(
    "退職者との重複は理由を変える",
    loginIdTakenError("sato", false).includes("退職した講師"),
    true,
  );
}

// ============================================================
console.log("\n[退職] 管理画面に入れる人を残す");
{
  // 自分を外すと、その場で管理画面に入れなくなる
  check(
    "自分は退職にできない",
    checkRetire(admin(1), { actorId: 1, activeAdminCount: 3 }),
    { ok: false, error: "自分を退職にすることはできません" },
  );

  // 管理者が0人になると、誰もログインして直せない
  check(
    "最後の管理者は退職にできない",
    checkRetire(admin(2), { actorId: 1, activeAdminCount: 1 }).ok,
    false,
  );
  check(
    "管理者が2人いれば退職にできる",
    checkRetire(admin(2), { actorId: 1, activeAdminCount: 2 }),
    { ok: true },
  );
  // 講師は何人減っても管理画面には影響しない
  check(
    "講師は管理者が1人でも退職にできる",
    checkRetire(teacher(3), { actorId: 1, activeAdminCount: 1 }),
    { ok: true },
  );

  check(
    "すでに退職なら何もしない",
    checkRetire(teacher(3, { active: false }), { actorId: 1, activeAdminCount: 2 }).ok,
    false,
  );

  // 自分かどうかの判定は、退職の可否より先に効く
  check(
    "自分が最後の管理者でも、まず自分だと言う",
    checkRetire(admin(1), { actorId: 1, activeAdminCount: 1 }),
    { ok: false, error: "自分を退職にすることはできません" },
  );
}

// ============================================================
console.log("\n[削除] 記録がある人は消させない");
{
  check(
    "記録が無ければ消せる",
    checkDelete(teacher(3), { actorId: 1, records: 0 }),
    { ok: true },
  );
  // 1件でもあれば止める。消すと締めた月の給与が計算し直せなくなる。
  check(
    "記録が1件でもあれば消せない",
    checkDelete(teacher(3), { actorId: 1, records: 1 }).ok,
    false,
  );
  check(
    "件数を理由に出す",
    checkDelete(teacher(3), { actorId: 1, records: 42 }),
    {
      ok: false,
      error: "講師3 さんには記録が42件あります。削除ではなく退職にしてください",
    },
  );
  check(
    "自分は記録が無くても消せない",
    checkDelete(admin(1), { actorId: 1, records: 0 }).ok,
    false,
  );
}

console.log("\n[画面] 出すボタンの種類");
{
  check("記録が無ければ削除", removalMode(0), "DELETE");
  check("記録があれば退職", removalMode(1), "RETIRE");
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
