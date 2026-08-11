/**
 * 必要人数と、集まっている希望の対比を確かめる。
 *   npm run verify
 *
 * ここは「自動作成を回す前に人が足りるかを示す」ための集計。
 * 実行して初めて「英語が埋まりません」と分かるのでは遅いので、
 * 数え方がずれていると画面の意味がなくなる。
 */
import {
  balanceBySubject,
  requiredBySlot,
  totalBalance,
  type DemandLite,
  type RequestLite,
  type SubjectLite,
  type TeacherSubjectLite,
} from "../lib/demand";
import { datesBetween } from "../lib/dates";
import { LESSON_STYLE, SHIFT } from "../lib/constants";

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

const SUBJECTS: SubjectLite[] = [
  { id: 1, name: "英語" },
  { id: 2, name: "数学" },
  { id: 3, name: "理科" },
];

// 高橋=英語/数学、田中=英語、伊藤=数学。理科は誰も担当できない。
const LINKS: TeacherSubjectLite[] = [
  { teacherId: 1, subjectId: 1 },
  { teacherId: 1, subjectId: 2 },
  { teacherId: 2, subjectId: 1 },
  { teacherId: 3, subjectId: 2 },
];

const d = (
  date: string,
  periodId: number,
  subjectId: number,
  required: number,
): DemandLite => ({ date, periodId, subjectId, format: LESSON_STYLE.INDIV_2, required });

const r = (
  teacherId: number,
  date: string,
  periodId: number,
  status: string = SHIFT.OK,
): RequestLite => ({
  teacherId,
  date,
  periodId,
  status,
});

console.log("\n[1] 期間の日を列挙する");
{
  check("3日間", datesBetween("2026-09-01", "2026-09-03"), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
  check("同じ日なら1件", datesBetween("2026-09-01", "2026-09-01"), ["2026-09-01"]);
  check("逆順なら空", datesBetween("2026-09-03", "2026-09-01"), []);
  check("月をまたぐ", datesBetween("2026-08-31", "2026-09-01").length, 2);
}

console.log("\n[2] 科目ごとに必要な延べコマ数を数える");
{
  const demands = [d("2026-09-01", 1, 1, 2), d("2026-09-01", 1, 2, 1), d("2026-09-02", 1, 1, 3)];
  const b = balanceBySubject(SUBJECTS, demands, [], LINKS);
  const by = (n: string) => b.find((x) => x.name === n)!;
  check("英語は 2+3", by("英語").required, 5);
  check("数学は 1", by("数学").required, 1);
  check("需要のない科目は0", by("理科").required, 0);
}

console.log("\n[3] 供給は「その科目を担当できる人が出られる数」");
{
  const demands = [d("2026-09-01", 1, 1, 1)];
  // 高橋(英数)と伊藤(数)が出られる。英語を教えられるのは高橋だけ。
  const requests = [r(1, "2026-09-01", 1), r(3, "2026-09-01", 1)];
  const b = balanceBySubject(SUBJECTS, demands, requests, LINKS);
  check("英語の供給は高橋の1人ぶん", b.find((x) => x.name === "英語")!.supplyUpperBound, 1);
}

console.log("\n[4] 「出られない」は供給に数えない");
{
  const demands = [d("2026-09-01", 1, 1, 1)];
  const requests = [r(1, "2026-09-01", 1, SHIFT.NG), r(2, "2026-09-01", 1, SHIFT.PREFER)];
  const b = balanceBySubject(SUBJECTS, demands, requests, LINKS);
  // NG の高橋は数えず、PREFER の田中だけ数える
  check("NG を除いて1人", b.find((x) => x.name === "英語")!.supplyUpperBound, 1);
}

console.log("\n[5] 需要のないコマの空きは供給に数えない");
{
  const demands = [d("2026-09-01", 1, 1, 1)];
  // 9/2 にも出られると答えているが、9/2 に英語の需要は無い
  const requests = [r(1, "2026-09-01", 1), r(1, "2026-09-02", 1), r(2, "2026-09-02", 1)];
  const b = balanceBySubject(SUBJECTS, demands, requests, LINKS);
  check("9/1 のぶんだけ", b.find((x) => x.name === "英語")!.supplyUpperBound, 1);
}

console.log("\n[6] 供給の上限を需要が超えたら「確実に足りない」");
{
  const demands = [d("2026-09-01", 1, 1, 3)];
  const requests = [r(1, "2026-09-01", 1)];
  const b = balanceBySubject(SUBJECTS, demands, requests, LINKS);
  check("英語は不足", b.find((x) => x.name === "英語")!.short, true);
  check("需要0の科目は不足ではない", b.find((x) => x.name === "理科")!.short, false);
}

console.log("\n[7] 担当できる講師が誰もいない科目を見つける");
{
  // 理科は LINKS に誰もいない。ここに需要を入れると自動作成が実行できない（P8）
  const demands = [d("2026-09-01", 1, 3, 1)];
  const b = balanceBySubject(SUBJECTS, demands, [], LINKS);
  check("理科は担当者なし", b.find((x) => x.name === "理科")!.noTeacher, true);
  check("英語は担当者あり", b.find((x) => x.name === "英語")!.noTeacher, false);
}
{
  // 需要が0なら、担当者がいなくても警告しない（授業を開かないので困らない）
  const b = balanceBySubject(SUBJECTS, [], [], LINKS);
  check("需要0なら担当者なしにしない", b.find((x) => x.name === "理科")!.noTeacher, false);
}

console.log("\n[8] 期間全体の総量");
{
  const demands = [d("2026-09-01", 1, 1, 2), d("2026-09-01", 1, 2, 1)];
  const requests = [r(1, "2026-09-01", 1), r(2, "2026-09-01", 1)];
  const t = totalBalance(demands, requests);
  check("必要は3コマ", t.required, 3);
  check("出られるは2コマ", t.available, 2);
  // 科目別の供給は重複を含むので、全体が足りているかは別に数える必要がある
  check("全体として不足", t.short, true);
}

console.log("\n[9] 日×コマごとの合計");
{
  const demands = [d("2026-09-01", 1, 1, 2), d("2026-09-01", 1, 2, 1), d("2026-09-01", 2, 1, 1)];
  const m = requiredBySlot(demands);
  check("1限は英2+数1", m.get("2026-09-01:1"), 3);
  check("2限は英1", m.get("2026-09-01:2"), 1);
  check("需要のないコマは未定義", m.get("2026-09-02:1"), undefined);
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
