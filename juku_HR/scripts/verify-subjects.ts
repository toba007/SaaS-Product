/**
 * 担当科目の集計を確かめる。
 *   npm run verify
 *
 * DB を使わない純粋関数のテスト。自動作成が候補を絞る土台なので、
 * ここの数え方がずれると「なぜこの講師が入らないのか」が説明できなくなる。
 */
import {
  coverage,
  levelMap,
  levelOf,
  nextLevel,
  teachersWithoutSubject,
  type SubjectLite,
  type TeacherLite,
  type TeacherSubjectLite,
} from "../lib/subjects";
import { SUBJECT_LEVEL } from "../lib/constants";

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
  { id: 4, name: "社会" },
];

const TEACHERS: TeacherLite[] = [
  { id: 1, name: "高橋" },
  { id: 2, name: "田中" },
  { id: 3, name: "伊藤" },
];

// 英語=2人 / 数学=2人 / 理科=1人（単独） / 社会=0人（担当者なし）
// 伊藤は1件も登録が無い
const LINKS: TeacherSubjectLite[] = [
  { teacherId: 1, subjectId: 1, level: SUBJECT_LEVEL.EXPERT },
  { teacherId: 1, subjectId: 3, level: SUBJECT_LEVEL.OK },
  { teacherId: 2, subjectId: 1, level: SUBJECT_LEVEL.OK },
  { teacherId: 2, subjectId: 2, level: SUBJECT_LEVEL.GOOD },
  { teacherId: 1, subjectId: 2, level: SUBJECT_LEVEL.OK },
];

console.log("\n[1] 押すたびに 未設定 → 可 → 得意 → 専門 → 未設定 と回る");
{
  check("未設定から可へ", nextLevel(SUBJECT_LEVEL.NONE), SUBJECT_LEVEL.OK);
  check("可から得意へ", nextLevel(SUBJECT_LEVEL.OK), SUBJECT_LEVEL.GOOD);
  check("得意から専門へ", nextLevel(SUBJECT_LEVEL.GOOD), SUBJECT_LEVEL.EXPERT);
  check("専門から未設定へ戻る", nextLevel(SUBJECT_LEVEL.EXPERT), SUBJECT_LEVEL.NONE);
  // 行が無い状態（null）は未設定と同じ扱い
  check("null は未設定と同じ", nextLevel(null), SUBJECT_LEVEL.OK);
  check("undefined は未設定と同じ", nextLevel(undefined), SUBJECT_LEVEL.OK);
}

console.log("\n[2] 科目ごとに担当できる講師を数える");
{
  const cov = coverage(SUBJECTS, LINKS);
  const by = (name: string) => cov.find((c) => c.name === name)!;

  check("英語は2人", by("英語").teacherCount, 2);
  check("数学は2人", by("数学").teacherCount, 2);
  check("理科は1人", by("理科").teacherCount, 1);
  check("社会は0人", by("社会").teacherCount, 0);
  check("英語の専門は1人", by("英語").expertCount, 1);
  check("数学の専門は0人", by("数学").expertCount, 0);
}

console.log("\n[3] 担当者のいない科目を見つける");
{
  const cov = coverage(SUBJECTS, LINKS);
  const uncovered = cov.filter((c) => c.uncovered).map((c) => c.name);
  // ここに需要を設定すると自動作成が実行できない（要件定義 P8）
  check("社会だけが担当者なし", uncovered, ["社会"]);
}

console.log("\n[4] 担当者が1人しかいない科目を警告する");
{
  const cov = coverage(SUBJECTS, LINKS);
  const single = cov.filter((c) => c.singlePoint).map((c) => c.name);
  check("理科だけが単独担当", single, ["理科"]);
  // 0人は「担当者なし」として別に扱う。同じ警告に混ぜると対処が変わってしまう。
  check("0人の科目は単独担当に含めない", cov.find((c) => c.name === "社会")!.singlePoint, false);
}

console.log("\n[5] 担当科目が1件も無い講師を見つける");
{
  const none = teachersWithoutSubject(TEACHERS, LINKS).map((t) => t.name);
  // この講師は自動作成の候補に一度も上がらない
  check("伊藤だけ未登録", none, ["伊藤"]);
}

console.log("\n[6] 講師×科目の習熟度を引く");
{
  const map = levelMap(LINKS);
  check("高橋の英語は専門", levelOf(map, 1, 1), SUBJECT_LEVEL.EXPERT);
  check("田中の英語は可", levelOf(map, 2, 1), SUBJECT_LEVEL.OK);
  check("登録が無いマスは未設定", levelOf(map, 3, 1), SUBJECT_LEVEL.NONE);
  check("存在しない講師も未設定", levelOf(map, 99, 1), SUBJECT_LEVEL.NONE);
}

console.log("\n[7] 何も登録されていない状態");
{
  const cov = coverage(SUBJECTS, []);
  check("全科目が担当者なし", cov.filter((c) => c.uncovered).length, 4);
  check("単独担当は0件", cov.filter((c) => c.singlePoint).length, 0);
  check("全講師が未登録", teachersWithoutSubject(TEACHERS, []).length, 3);
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
