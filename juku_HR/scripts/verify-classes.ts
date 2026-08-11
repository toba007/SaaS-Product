/**
 * 集団クラスの編成まわりを確かめる。
 *   npm run verify
 *
 * ここでいちばん大事なのは「集団の必要講師数は開講クラス数で決まる」こと。
 * 生徒数から計算してしまうと、5人のクラスに3人の講師を呼ぶことになる。
 */
import {
  activeClasses,
  duplicateEnrollments,
  groupDemand,
  meetsOn,
  memberCount,
  overCapacity,
  unassignedStudents,
  type ClassGroupLite,
  type EnrollmentLite,
  type SessionLite,
  type StudentLite,
  type StudentSubjectLite,
} from "../lib/classes";
import { LESSON_STYLE } from "../lib/constants";

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

const ENGLISH = 1;
const MATH = 2;

/** 中2英語Ⅱ */
function cls(over: Partial<ClassGroupLite> = {}): ClassGroupLite {
  return {
    id: 1,
    name: "中2英語Ⅱ",
    grade: "中2",
    subjectId: ENGLISH,
    level: 2,
    capacity: 0,
    fromDate: "2026-04-01",
    toDate: "2027-03-31",
    ...over,
  };
}

/** クラスの時間割を1コマぶん */
const sess = (classGroupId: number, dayOfWeek: number, periodId: number): SessionLite => ({
  classGroupId,
  dayOfWeek,
  periodId,
});

const STUDENTS: StudentLite[] = [
  { id: 1, name: "田中 太郎", grade: "中2" },
  { id: 2, name: "佐藤 花子", grade: "中2" },
  { id: 3, name: "鈴木 一郎", grade: "中2" },
];

const ss = (
  studentId: number,
  subjectId: number,
  format: string = LESSON_STYLE.GROUP,
  active = true,
): StudentSubjectLite => ({ studentId, subjectId, format, active });

const en = (classGroupId: number, studentId: number): EnrollmentLite => ({
  classGroupId,
  studentId,
});

const TUE = 2; // 2026-09-01 は火曜
const WED = 3;

console.log("\n[1] その日にそのコマの授業があるか");
{
  const c = cls();
  const s = sess(1, TUE, 12);
  check("曜日が合えば授業あり", meetsOn(c, s, "2026-09-01"), true);
  check("曜日が違えば無し", meetsOn(c, s, "2026-09-02"), false);
  check("期間より前は無し", meetsOn(c, s, "2026-03-31"), false);
  check("期間より後は無し", meetsOn(c, s, "2027-04-06"), false);
  check("別クラスの時間割は無視", meetsOn(c, sess(99, TUE, 12), "2026-09-01"), false);
}

console.log("\n[2] 組み直しで終了したクラスを除く");
{
  const old = cls({ id: 1, toDate: "2026-08-31" });
  const now = cls({ id: 2, fromDate: "2026-09-01" });
  const active = activeClasses([old, now], "2026-09-01", "2026-09-30");
  // 人数が増えて分割したときなど、古いクラスは toDate を切って残す
  check("9月に有効なのは新しいほうだけ", active.map((c) => c.id), [2]);
}

console.log("\n[3] 同じクラスが同じ日に何コマも入る（英英数）");
{
  // 月曜: 中1Ⅰは 英・英・数、中1Ⅱは 数・数・英
  //   1限  Ⅰ=英語Ⅰ   Ⅱ=数学Ⅱ
  //   2限  Ⅰ=英語Ⅰ   Ⅱ=数学Ⅱ
  //   3限  Ⅰ=数学Ⅰ   Ⅱ=英語Ⅱ
  const MON = 1;
  const classes = [
    cls({ id: 1, grade: "中1", subjectId: ENGLISH, level: 1, name: "中1英語Ⅰ" }),
    cls({ id: 2, grade: "中1", subjectId: MATH, level: 1, name: "中1数学Ⅰ" }),
    cls({ id: 3, grade: "中1", subjectId: MATH, level: 2, name: "中1数学Ⅱ" }),
    cls({ id: 4, grade: "中1", subjectId: ENGLISH, level: 2, name: "中1英語Ⅱ" }),
  ];
  const sessions = [
    sess(1, MON, 11), sess(1, MON, 12), // 英語Ⅰが1限と2限（英英）
    sess(2, MON, 13), //                   数学Ⅰが3限（数）
    sess(3, MON, 11), sess(3, MON, 12), // 数学Ⅱが1限と2限（数数）
    sess(4, MON, 13), //                   英語Ⅱが3限（英）
  ];

  const d = groupDemand(classes, sessions, ["2026-09-07"]); // 月曜
  const at = (periodId: number, subjectId: number) =>
    d.find((x) => x.periodId === periodId && x.subjectId === subjectId)?.required ?? 0;

  // 同じクラスが同じ日に2コマ入ることが表現できている
  check("1限は英語1人・数学1人", [at(11, ENGLISH), at(11, MATH)], [1, 1]);
  check("2限も英語1人・数学1人", [at(12, ENGLISH), at(12, MATH)], [1, 1]);
  check("3限も英語1人・数学1人", [at(13, ENGLISH), at(13, MATH)], [1, 1]);
  check("合計6コマぶんの需要", d.reduce((s, x) => s + x.required, 0), 6);
}

console.log("\n[4] 集団の必要講師数は開講クラス数（生徒数ではない）");
{
  // 火曜2限に中2英語が2クラス
  const classes = [
    cls({ id: 1, level: 1, name: "中2英語Ⅰ" }),
    cls({ id: 2, level: 2, name: "中2英語Ⅱ" }),
  ];
  const sessions = [sess(1, TUE, 12), sess(2, TUE, 12)];
  const d = groupDemand(classes, sessions, ["2026-09-01"]);
  check("1件にまとまる", d.length, 1);
  // ここが要。生徒が何人いても、クラス数がそのまま必要な講師数になる。
  check("英語講師が2人必要", d[0].required, 2);
}

{
  // 学年が違っても、同じ科目・同じコマなら講師の必要数としては足し合わせる
  const classes = [
    cls({ id: 1, grade: "中1", level: 1 }),
    cls({ id: 2, grade: "中2", level: 1 }),
  ];
  const sessions = [sess(1, TUE, 12), sess(2, TUE, 12)];
  check("学年をまたいで合算", groupDemand(classes, sessions, ["2026-09-01"])[0].required, 2);
}

{
  const d = groupDemand([cls()], [sess(1, WED, 12)], ["2026-09-01"]); // 火曜に水曜の授業
  check("授業の無い日は需要ゼロ", d.length, 0);
}

{
  // 時間割が入っていないクラスは需要を生まない
  check("時間割なしなら需要ゼロ", groupDemand([cls()], [], ["2026-09-01"]).length, 0);
}

console.log("\n[5] クラスに入っていない生徒を見つける");
{
  const classes = [cls({ id: 1 })];
  const subs = [
    ss(1, ENGLISH), // 田中：英語を集団で取る
    ss(2, ENGLISH), // 佐藤：同上
    ss(3, MATH), // 鈴木：数学を集団で取る
  ];
  const enrolls = [en(1, 1)]; // 田中だけ英語クラスに入っている

  const un = unassignedStudents(STUDENTS, subs, classes, enrolls);
  // 振り分け漏れがあると、その生徒は授業に出られないまま気づかれない
  check("2件（佐藤の英語・鈴木の数学）", un.length, 2);
  check("佐藤が英語未配属", un.some((u) => u.student.id === 2 && u.subjectId === ENGLISH), true);
  check("鈴木が数学未配属", un.some((u) => u.student.id === 3 && u.subjectId === MATH), true);
  check("田中は出ない", un.some((u) => u.student.id === 1), false);
}

{
  // 個別で取っている科目はクラスに入らないので、未配属に数えない
  const subs = [ss(1, ENGLISH, LESSON_STYLE.INDIV_2)];
  check("個別は対象外", unassignedStudents(STUDENTS, subs, [cls()], []).length, 0);
}

{
  const subs = [ss(1, ENGLISH, LESSON_STYLE.GROUP, false)];
  check("やめた科目は対象外", unassignedStudents(STUDENTS, subs, [cls()], []).length, 0);
}

console.log("\n[6] 同じ科目で2つのクラスに入っていないか");
{
  const classes = [cls({ id: 1, level: 1 }), cls({ id: 2, level: 2 })];
  // 学年が上がったときの入れ直しで、古いクラスから外し忘れると起きる
  const dup = duplicateEnrollments(classes, [en(1, 1), en(2, 1)]);
  check("重複を見つける", dup.length, 1);
  check("生徒", dup[0].studentId, 1);
  check("両方のクラスを出す", dup[0].classIds, [1, 2]);
}

{
  const classes = [
    cls({ id: 1, subjectId: ENGLISH }),
    cls({ id: 2, subjectId: MATH }),
  ];
  check("別の科目なら問題なし", duplicateEnrollments(classes, [en(1, 1), en(2, 1)]).length, 0);
}

console.log("\n[7] 定員を超えているクラス");
{
  const over = overCapacity([cls({ id: 1, capacity: 2 })], [en(1, 1), en(1, 2), en(1, 3)]);
  check("超過を見つける", over.length, 1);
  check("在籍数", over[0].count, 3);
}

{
  // 定員0は「上限なし」。何人でも警告しない。
  const over = overCapacity([cls({ id: 1, capacity: 0 })], [en(1, 1), en(1, 2), en(1, 3)]);
  check("定員0なら警告しない", over.length, 0);
}

console.log("\n[8] 在籍人数");
{
  const enrolls = [en(1, 1), en(1, 2), en(2, 3)];
  check("クラス1は2人", memberCount(1, enrolls), 2);
  check("クラス2は1人", memberCount(2, enrolls), 1);
  check("誰もいないクラスは0", memberCount(9, enrolls), 0);
}

console.log("\n[9] レベルは必ず3つあるわけではない");
{
  // 人数的に1クラスだけのこともある。レベルは枠ではなくラベル。
  const one = [cls({ id: 1, level: 1, name: "中3社会Ⅰ" })];
  check("1クラスでも需要が出る", groupDemand(one, [sess(1, TUE, 12)], ["2026-09-01"])[0].required, 1);

  const two = [cls({ id: 1, level: 1 }), cls({ id: 2, level: 2 })];
  const s2 = [sess(1, TUE, 12), sess(2, TUE, 12)];
  check("2クラスなら2人", groupDemand(two, s2, ["2026-09-01"])[0].required, 2);
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
