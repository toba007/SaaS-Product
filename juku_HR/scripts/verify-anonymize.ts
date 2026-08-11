/**
 * 仮名化を検証する。
 *   npm run verify:anonymize
 *
 * これが通らないうちは LLM を使う機能を有効にしない。
 * 実名が1件でも外に出れば、ローカルかAPIかに関係なく個人情報の事故になる。
 * LLM は不要なので、DB もネットワークも使わずに動く。
 */

import {
  StudentLite,
  anonymize,
  findRemainingNames,
  pseudonym,
  resolveAlias,
  toStudentId,
} from "../lib/ai/anonymize";

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

const STUDENTS: StudentLite[] = [
  { id: 1, name: "田中 太郎", kana: "たなか たろう" },
  { id: 2, name: "佐藤 花子", kana: "さとう はなこ" },
  { id: 3, name: "鈴木 一郎", kana: "すずき いちろう" },
  { id: 12, name: "田中 次郎", kana: "たなか じろう" }, // 同姓
];

console.log("\n仮名化\n");

// --- 基本 ---
{
  const r = anonymize("田中と佐藤を離す", STUDENTS);
  check("姓だけの表記を置換する", r.text, "生徒001と生徒002を離す");
  check("対応表に載る", toStudentId("生徒001", r.table), 1);
}

{
  const r = anonymize("田中太郎はよくできる", STUDENTS);
  check("空白なしのフルネームを置換する", r.text, "生徒001はよくできる");
}

{
  const r = anonymize("田中 太郎 と 佐藤 花子", STUDENTS);
  check("空白ありのフルネームを置換する", r.text, "生徒001 と 生徒002");
}

{
  const r = anonymize("たなかくんが騒いでいた", STUDENTS);
  check("かな表記を置換する", r.text, "生徒001くんが騒いでいた");
}

// --- 長い表記を優先する ---
{
  // 「田中」を先に置換してしまうと「生徒001太郎」になる
  const r = anonymize("田中太郎と田中次郎", STUDENTS);
  check("長い表記から先に置換する", r.text.includes("太郎"), false);
  check("同上（次郎も残らない）", r.text.includes("次郎"), false);
}

// --- 同姓の扱い ---
{
  const r = anonymize("田中が遅刻した", STUDENTS);
  check("同姓がいる場合も置換はする", r.text.includes("田中"), false);
  check("同姓を曖昧として報告する", r.ambiguous.includes("田中"), true);
}

// --- 実名の残留検出（ここが本丸） ---
{
  const r = anonymize("田中と佐藤と鈴木", STUDENTS);
  check("置換後に実名が残っていない", findRemainingNames(r.text, STUDENTS), []);
}

{
  // 仮名化を通していない生のテキストは必ず検出されること
  const hits = findRemainingNames("田中が来た", STUDENTS);
  check("未仮名化のテキストを検出する", hits.length > 0, true);
}

// --- 誤爆しないこと ---
{
  const r = anonymize("今日は林檎を配った", STUDENTS);
  check("関係ない語を置換しない", r.text, "今日は林檎を配った");
}

{
  const r = anonymize("特筆事項なし", STUDENTS);
  check("該当なしなら何も変えない", r.text, "特筆事項なし");
  check("対応表は空", r.table.size, 0);
}

// --- 仮名IDの形式 ---
{
  check("仮名IDは3桁ゼロ埋め", pseudonym(7), "生徒007");
  check("3桁を超えてもそのまま", pseudonym(1234), "生徒1234");
}

// --- 対応表に無いIDは戻せない ---
{
  const r = anonymize("田中", STUDENTS);
  check("架空の仮名IDは null を返す", toStudentId("生徒999", r.table), null);
}

// --- LLM の表記ゆれへの耐性 ---
// 小さいモデルが実際に返してきた形。完全一致だけで照合すると全部捨ててしまう。
{
  const r = anonymize("田中と佐藤と鈴木", STUDENTS);
  check("そのままの形", resolveAlias("生徒001", r.table), 1);
  check("空白入り", resolveAlias("生徒 001", r.table), 1);
  check("敬称つき", resolveAlias("生徒001さん", r.table), 1);
  check("全角数字", resolveAlias("生徒００１", r.table), 1);
  check("複合表記は先頭を採る", resolveAlias("生徒002 & 生徒003", r.table), 2);
  check("数字が無いものは null", resolveAlias("None", r.table), null);
  check("空文字は null", resolveAlias("", r.table), null);
  check("undefined は null", resolveAlias(undefined, r.table), null);
  check("対応表に無い番号は null", resolveAlias("生徒999", r.table), null);
}

console.log(
  failed === 0
    ? "\n  すべて通りました\n"
    : `\n  ${failed} 件失敗しました\n`,
);
process.exit(failed === 0 ? 0 : 1);
