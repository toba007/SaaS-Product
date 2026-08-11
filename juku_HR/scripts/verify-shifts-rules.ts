/**
 * ハード制約（H1〜H13）の判定を確かめる。
 *   npm run verify
 *
 * ここは自動作成エンジンと盤面の手修正の両方が通る関門。
 * 1件でも漏れると「出られないと答えた日に入っている」シフトが確定できてしまう。
 * DB を使わない純粋関数なので、境界をまとめて固定しておく。
 */
import {
  buildContext,
  checkAdd,
  countInWeek,
  countOnDay,
  isAllowed,
  maxRunWith,
  tryAdd,
  type RuleContext,
  type TeacherState,
} from "../lib/shifts-rules";
import { SHIFT } from "../lib/constants";

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

/** 判定結果に指定のコードが含まれるか */
function has(ctx: RuleContext, cand: Parameters<typeof checkAdd>[1], code: string, mode: "auto" | "manual" = "auto") {
  return checkAdd(ctx, cand, mode).some((v) => v.code === code);
}
function severityOf(ctx: RuleContext, cand: Parameters<typeof checkAdd>[1], code: string, mode: "auto" | "manual") {
  return checkAdd(ctx, cand, mode).find((v) => v.code === code)?.severity;
}

const RULE = { maxPerDay: 4, maxPerWeek: 12, maxConsecutive: 3, minPerWeek: 0 };

/** 英語(1)と数学(2)を担当できる講師 */
function teacher(id: number, over: Partial<TeacherState> = {}): TeacherState {
  return {
    id,
    name: `講師${id}`,
    active: true,
    rule: { ...RULE },
    subjects: new Set([1, 2]),
    ...over,
  };
}

/** 19:15 から 50分・間5分で4コマ。連続判定が時刻で効くように時刻を持たせる。 */
const PERIODS = [
  { id: 11, order: 0, startTime: "19:15", endTime: "20:05" },
  { id: 12, order: 1, startTime: "20:10", endTime: "21:00" },
  { id: 13, order: 2, startTime: "21:05", endTime: "21:55" },
  { id: 14, order: 3, startTime: "22:00", endTime: "22:50" },
];

/** 既定：講師1が 9/1 の全コマに「出られる」と回答。英語の需要は各コマ2人。 */
function base(over: Partial<Parameters<typeof buildContext>[0]> = {}) {
  return buildContext({
    teachers: [teacher(1), teacher(2)],
    periods: PERIODS,
    requests: PERIODS.flatMap((p) =>
      [1, 2].map((t) => ({
        teacherId: t,
        date: "2026-09-01",
        periodId: p.id,
        status: SHIFT.OK,
      })),
    ),
    closedDates: [],
    demands: PERIODS.map((p) => ({
      date: "2026-09-01",
      periodId: p.id,
      subjectId: 1,
      required: 2,
    })),
    assignments: [],
    ...over,
  });
}

const cand = (teacherId = 1, periodId = 11, subjectId = 1, date = "2026-09-01") => ({
  teacherId,
  date,
  periodId,
  subjectId,
});

console.log("\n[0] 問題なければ何も出ない");
{
  check("違反なし", checkAdd(base(), cand()), []);
  check("保存してよい", isAllowed(checkAdd(base(), cand())), true);
}

console.log("\n[H1] 「出られない」コマには入れない");
{
  const ctx = base({
    requests: [{ teacherId: 1, date: "2026-09-01", periodId: 11, status: SHIFT.NG }],
  });
  check("弾く", has(ctx, cand(), "H1_NG"), true);
  // 手で直すときも NG だけは許さない。本人が明示的に断っているため。
  check("手修正でも error", severityOf(ctx, cand(), "H1_NG", "manual"), "error");
}

console.log("\n[H2] 未回答のコマには入れない（沈黙は承諾ではない）");
{
  const ctx = base({ requests: [] });
  check("自動作成では弾く", severityOf(ctx, cand(), "H2_UNANSWERED", "auto"), "error");
  // 当日の欠員など、自動化が想定しない事態に人が対応できる余地を残す
  check("手修正では警告どまり", severityOf(ctx, cand(), "H2_UNANSWERED", "manual"), "warning");
  check("手修正なら保存できる", isAllowed(checkAdd(ctx, cand(), "manual")), true);
}

console.log("\n[H3] 休校日には入れない");
{
  const ctx = base({ closedDates: ["2026-09-01"] });
  check("弾く", has(ctx, cand(), "H3_CLOSED"), true);
  check("手修正でも error", severityOf(ctx, cand(), "H3_CLOSED", "manual"), "error");
}

console.log("\n[H5] 必要人数を超えない");
{
  const ctx = base({
    assignments: [
      { teacherId: 2, date: "2026-09-01", periodId: 11, subjectId: 1 },
      { teacherId: 3, date: "2026-09-01", periodId: 11, subjectId: 1 },
    ],
  });
  // 需要2に対して既に2人入っている
  check("自動作成では弾く", severityOf(ctx, cand(), "H5_OVER_DEMAND", "auto"), "error");
  check("手修正では警告どまり", severityOf(ctx, cand(), "H5_OVER_DEMAND", "manual"), "warning");
}
{
  // 需要が設定されていないコマは、超過の判定ができないので何も言わない
  const ctx = base({ demands: [] });
  check("需要未設定なら判定しない", has(ctx, cand(), "H5_OVER_DEMAND"), false);
}
{
  // 別科目の割当は英語の枠を埋めない
  const ctx = base({
    assignments: [
      { teacherId: 2, date: "2026-09-01", periodId: 11, subjectId: 2 },
      { teacherId: 3, date: "2026-09-01", periodId: 11, subjectId: 2 },
    ],
  });
  check("科目が違えば埋まっていない", has(ctx, cand(), "H5_OVER_DEMAND"), false);
}

console.log("\n[H6] 1日の上限を超えない");
{
  const ctx = base({
    assignments: [11, 12, 13].map((p) => ({
      teacherId: 1,
      date: "2026-09-01",
      periodId: p,
      subjectId: 1,
    })),
  });
  check("3コマ入っている", countOnDay(ctx, 1, "2026-09-01"), 3);
  // 上限4なので4コマ目は入る
  check("4コマ目は入る", has(ctx, cand(1, 14), "H6_MAX_PER_DAY"), false);
}
{
  const ctx = base({
    teachers: [teacher(1, { rule: { ...RULE, maxPerDay: 2 } })],
    assignments: [11, 12].map((p) => ({
      teacherId: 1,
      date: "2026-09-01",
      periodId: p,
      subjectId: 1,
    })),
  });
  check("上限2なら3コマ目を弾く", has(ctx, cand(1, 13), "H6_MAX_PER_DAY"), true);
}

console.log("\n[H7] 週の上限を超えない（日曜〜土曜）");
{
  // 2026-09-01 は火曜。同じ週の 8/30(日) 〜 9/5(土) を数える。
  const ctx = base({
    teachers: [teacher(1, { rule: { ...RULE, maxPerWeek: 2 } })],
    assignments: [
      { teacherId: 1, date: "2026-08-30", periodId: 11, subjectId: 1 },
      { teacherId: 1, date: "2026-09-03", periodId: 11, subjectId: 1 },
    ],
  });
  check("週内を2件数える", countInWeek(ctx, 1, "2026-09-01"), 2);
  check("3件目を弾く", has(ctx, cand(), "H7_MAX_PER_WEEK"), true);
}
{
  // 前の週の割当は数えない
  const ctx = base({
    teachers: [teacher(1, { rule: { ...RULE, maxPerWeek: 1 } })],
    assignments: [{ teacherId: 1, date: "2026-08-29", periodId: 11, subjectId: 1 }],
  });
  check("8/29(土)は前の週", countInWeek(ctx, 1, "2026-09-01"), 0);
  check("弾かない", has(ctx, cand(), "H7_MAX_PER_WEEK"), false);
}

console.log("\n[H8] 連続コマの上限を超えない");
{
  const ctx = base({
    assignments: [11, 12].map((p) => ({
      teacherId: 1,
      date: "2026-09-01",
      periodId: p,
      subjectId: 1,
    })),
  });
  check("3コマ連続になる", maxRunWith(ctx, 1, "2026-09-01", 13), 3);
  check("上限3なら通る", has(ctx, cand(1, 13), "H8_MAX_CONSECUTIVE"), false);
}
{
  const ctx = base({
    assignments: [11, 12, 13].map((p) => ({
      teacherId: 1,
      date: "2026-09-01",
      periodId: p,
      subjectId: 1,
    })),
  });
  check("4コマ連続を弾く", has(ctx, cand(1, 14), "H8_MAX_CONSECUTIVE"), true);
}
{
  // 飛んでいれば連続ではない。1限と3限に入っていても2限が空いていれば途切れる。
  const ctx = base({
    teachers: [teacher(1, { rule: { ...RULE, maxConsecutive: 2 } })],
    assignments: [
      { teacherId: 1, date: "2026-09-01", periodId: 11, subjectId: 1 },
      { teacherId: 1, date: "2026-09-01", periodId: 13, subjectId: 1 },
    ],
  });
  check("飛び石は連続1", maxRunWith(ctx, 1, "2026-09-01", 11), 1);
  // 12限を埋めると 11,12,13 で3連続になる
  check("間を埋めると3連続で弾く", has(ctx, cand(1, 12), "H8_MAX_CONSECUTIVE"), true);
}

console.log("\n[H9] 退職した講師には入れない");
{
  const ctx = base({ teachers: [teacher(1, { active: false })] });
  check("弾く", has(ctx, cand(), "H9_INACTIVE"), true);
  check("手修正でも error", severityOf(ctx, cand(), "H9_INACTIVE", "manual"), "error");
  // 存在しない講師IDも同じ扱い
  check("存在しないIDも弾く", has(base(), cand(999), "H9_INACTIVE"), true);
}

console.log("\n[H12] 担当できない科目には入れない");
{
  const ctx = base({ teachers: [teacher(1, { subjects: new Set([2]) })] });
  // 英語(1)を担当できない講師を英語に入れようとする
  check("弾く", has(ctx, cand(1, 11, 1), "H12_SUBJECT"), true);
  check("担当できる科目なら通る", has(ctx, cand(1, 11, 2), "H12_SUBJECT"), false);
  // ここが漏れると「人数は足りているが時間割が組めない」シフトができる
  check("手修正でも error", severityOf(ctx, cand(1, 11, 1), "H12_SUBJECT", "manual"), "error");
}

console.log("\n[H13] 同じコマに二重に入れない");
{
  const ctx = base({
    assignments: [{ teacherId: 1, date: "2026-09-01", periodId: 11, subjectId: 1 }],
  });
  check("同じ科目で弾く", has(ctx, cand(1, 11, 1), "H13_DOUBLE_BOOKED"), true);
  // 科目が違っても同時には持てない
  check("別科目でも弾く", has(ctx, cand(1, 11, 2), "H13_DOUBLE_BOOKED"), true);
  check("別のコマなら通る", has(ctx, cand(1, 12, 1), "H13_DOUBLE_BOOKED"), false);
}

console.log("\n[追加] 通ったぶんだけ文脈に積む");
{
  const ctx = base();
  const a = tryAdd(ctx, cand(1, 11));
  check("1件目は通る", a.ok, true);
  check("積まれる", ctx.assignments.length, 1);

  const b = tryAdd(ctx, cand(1, 11)); // 同じコマ
  check("2件目は弾かれる", b.ok, false);
  check("弾かれたら積まない", ctx.assignments.length, 1);
}

console.log("\n[追加] 複数の違反をまとめて返す");
{
  const ctx = base({
    teachers: [teacher(1, { subjects: new Set([2]) })],
    requests: [{ teacherId: 1, date: "2026-09-01", periodId: 11, status: SHIFT.NG }],
    closedDates: ["2026-09-01"],
  });
  const codes = checkAdd(ctx, cand()).map((v) => v.code).sort();
  // 直すべきものが1つずつしか分からないと、何度も保存し直すことになる
  check("休校・NG・科目の3つ", codes, ["H12_SUBJECT", "H1_NG", "H3_CLOSED"].sort());
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
