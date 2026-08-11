/**
 * 学年帯ごとの時間割まわりを確かめる。
 *   npm run verify
 *
 * ここが狂うと、シフトの中身は「正しく見える」まま間違う。
 * 小学生の時間帯と中学生の時間帯を別々に登録できるようにしたことで、
 * これまで「コマ番号」で足りていた判定が足りなくなった：
 *
 *   - 連続コマ … 小2限(〜19:05) のあと 中1限(19:15〜) は続けて教えている。
 *                 番号で見ると 2 → 1 と戻るので、連続だと分からない。
 *   - 同時刻   … 中1限と高1限が同じ19:15開始のことがある。
 *                 コマとしては別物なので、番号で見ると二重割当にならない。
 *
 * どちらも「動けない予定」が正常として確定できてしまうので、時刻で見る。
 * DB を使わない純粋関数なので、境界をまとめて固定しておく。
 */
import {
  byTime,
  groupByBand,
  isBackToBack,
  lengthOf,
  minutesOf,
  overlappingPairs,
  overlaps,
  periodsForGrade,
  periodsOfDay,
  type PeriodLite,
} from "../lib/periods";
import { buildContext, checkAdd, maxRunWith } from "../lib/shifts-rules";
import { normalizeSetting } from "../lib/settings";
import {
  GRADE_BAND,
  SHIFT,
  bandOfGrade,
  indivSizeOf,
  lessonStyleLabel,
  lessonStyles,
} from "../lib/constants";

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

/**
 * 実際の塾から聞いた時間割。
 * 小学生は17:40から40分で2コマ、中学生は19:15から50分で3コマ。
 */
function p(
  id: number,
  gradeBand: string,
  name: string,
  startTime: string,
  endTime: string,
  order: number,
  termKind = "REGULAR",
): PeriodLite {
  return { id, termKind, gradeBand, name, startTime, endTime, order };
}

const E1 = p(1, GRADE_BAND.ELEM, "1限", "17:40", "18:20", 0);
const E2 = p(2, GRADE_BAND.ELEM, "2限", "18:25", "19:05", 1);
const J1 = p(3, GRADE_BAND.JUNIOR, "1限", "19:15", "20:05", 0);
const J2 = p(4, GRADE_BAND.JUNIOR, "2限", "20:10", "21:00", 1);
const J3 = p(5, GRADE_BAND.JUNIOR, "3限", "21:05", "21:55", 2);
const REAL = [E1, E2, J1, J2, J3];

// ============================================================
console.log("\n[時刻] 分に直す・長さ・重なり");
{
  check("17:40 は 1060分", minutesOf("17:40"), 17 * 60 + 40);
  check("00:00 は 0分", minutesOf("00:00"), 0);
  check("小1限は40分", lengthOf(E1), 40);
  check("中1限は50分", lengthOf(J1), 50);

  check("小1限と小2限は重ならない", overlaps(E1, E2), false);
  check("小2限と中1限は重ならない", overlaps(E2, J1), false);
  // 終わりと始まりが同じ時刻は「重ならない」。ここを重なる扱いにすると、
  // 隙間なく並べただけの普通の時間割が全部エラーになる。
  const a = p(90, GRADE_BAND.ALL, "A", "17:00", "18:00", 0);
  const b = p(91, GRADE_BAND.ALL, "B", "18:00", "19:00", 1);
  check("終わり=始まりは重ならない", overlaps(a, b), false);
  const c = p(92, GRADE_BAND.ALL, "C", "17:30", "18:30", 0);
  check("1分でもかぶれば重なる", overlaps(a, c), true);
  check("重なりは向きに関係ない", overlaps(c, a), true);
}

// ============================================================
console.log("\n[並び] 学年帯をまたいで時刻順");
{
  // 登録順はばらばらでも、1日の並びは時刻順になる
  const shuffled = [J2, E1, J3, E2, J1];
  check(
    "小1→小2→中1→中2→中3",
    periodsOfDay(shuffled, "REGULAR").map((x) => x.id),
    [1, 2, 3, 4, 5],
  );
  check(
    "期タイプが違うコマは混ざらない",
    periodsOfDay([...REAL, p(9, GRADE_BAND.ALL, "1限", "09:00", "10:20", 0, "SUMMER")], "SUMMER")
      .map((x) => x.id),
    [9],
  );
  // 同じ時刻の2コマが行ったり来たりすると、実行のたびに結果が変わる
  const x = p(20, GRADE_BAND.JUNIOR, "1限", "19:15", "20:05", 0);
  const y = p(21, GRADE_BAND.HIGH, "1限", "19:15", "20:05", 0);
  check("同時刻は id で決まる", [y, x].sort(byTime).map((v) => v.id), [20, 21]);
}

// ============================================================
console.log("\n[学年] その学年が使うコマ");
{
  check("小5は小学生の枠", bandOfGrade("小5"), GRADE_BAND.ELEM);
  check("中2は中学生の枠", bandOfGrade("中2"), GRADE_BAND.JUNIOR);
  check("高1は高校生の枠", bandOfGrade("高1"), GRADE_BAND.HIGH);

  check(
    "小5は2コマ",
    periodsForGrade(REAL, "小5", "REGULAR").map((x) => x.id),
    [1, 2],
  );
  check(
    "中2は3コマ",
    periodsForGrade(REAL, "中2", "REGULAR").map((x) => x.id),
    [3, 4, 5],
  );
  // 高校生の登録が無ければ中学生と同じ枠。ここで拾えないと、
  // 高校生の授業だけコマが無く、需要が0件になって静かに消える。
  check(
    "高1は登録が無ければ中学生の枠",
    periodsForGrade(REAL, "高1", "REGULAR").map((x) => x.id),
    [3, 4, 5],
  );
  const withHigh = [...REAL, p(6, GRADE_BAND.HIGH, "1限", "20:10", "21:40", 0)];
  check(
    "高校生の登録があればそちら",
    periodsForGrade(withHigh, "高1", "REGULAR").map((x) => x.id),
    [6],
  );
  // 学年で分けない塾
  const allBand = [
    p(30, GRADE_BAND.ALL, "1限", "17:00", "18:20", 0),
    p(31, GRADE_BAND.ALL, "2限", "18:30", "19:50", 1),
  ];
  check(
    "全学年だけの塾は小5も中2もそれを使う",
    [
      periodsForGrade(allBand, "小5", "REGULAR").map((x) => x.id),
      periodsForGrade(allBand, "中2", "REGULAR").map((x) => x.id),
    ],
    [[30, 31], [30, 31]],
  );
  check("何も登録が無ければ空", periodsForGrade([], "中2", "REGULAR"), []);
}

// ============================================================
console.log("\n[登録画面] 帯ごとのまとめと、重なりの検出");
{
  const g = groupByBand(REAL, "REGULAR");
  check("小学生2コマ・中学生3コマ", [
    g.get(GRADE_BAND.ELEM)?.length,
    g.get(GRADE_BAND.JUNIOR)?.length,
  ], [2, 3]);

  check("実際の時間割に重なりは無い", overlappingPairs(REAL).length, 0);

  // 中と高を並行して開ける塾。授業としては成立するが、講師は共有できない。
  const parallel = [...REAL, p(7, GRADE_BAND.HIGH, "1限", "19:15", "20:05", 0)];
  const clash = overlappingPairs(parallel);
  check("中1限と高1限が重なる", clash.length, 1);
  check("学年帯が違うことが分かる", clash[0]?.sameBand, false);

  // 同じ帯の中の重なりは、まず入力の間違い
  const typo = [E1, p(8, GRADE_BAND.ELEM, "2限", "18:00", "18:40", 1)];
  check("同じ帯の重なりは印を付ける", overlappingPairs(typo)[0]?.sameBand, true);
}

// ============================================================
console.log("\n[連続] 学年帯をまたいでも「続けて教えている」");
{
  check("小1限→小2限は連続（5分空き）", isBackToBack(E1, E2), true);
  check("小2限→中1限は連続（10分空き）", isBackToBack(E2, J1), true);
  check("小1限→中1限は連続ではない", isBackToBack(E1, J1), false);
  check("順番が逆なら連続ではない", isBackToBack(J1, E2), false);
}

// ============================================================
console.log("\n[H8] 連続コマの上限が、帯をまたいでも効く");
{
  const D = "2026-09-01";
  const ctx = buildContext({
    teachers: [
      {
        id: 1,
        name: "テスト講師",
        active: true,
        rule: { maxPerDay: 9, maxPerWeek: 99, maxConsecutive: 3, minPerWeek: 0 },
        subjects: new Set([1]),
      },
    ],
    periods: REAL.map((x) => ({
      id: x.id,
      order: x.order,
      startTime: x.startTime,
      endTime: x.endTime,
    })),
    requests: REAL.map((x) => ({
      teacherId: 1,
      date: D,
      periodId: x.id,
      status: SHIFT.OK,
    })),
    closedDates: [],
    demands: REAL.map((x) => ({
      date: D,
      periodId: x.id,
      subjectId: 1,
      required: 9,
    })),
    assignments: [
      { teacherId: 1, date: D, periodId: E1.id, subjectId: 1 },
      { teacherId: 1, date: D, periodId: E2.id, subjectId: 1 },
    ],
  });

  // 小1・小2に入っている状態で中1限を足すと、17:40から休みなく3コマ目になる。
  // コマ番号で見ると 0,1 のあとに 0 が来るので、連続と分からず素通りしていた。
  check("小1+小2 に中1限を足すと3連続", maxRunWith(ctx, 1, D, J1.id), 3);
  check(
    "上限3ちょうどなら通る",
    checkAdd(ctx, { teacherId: 1, date: D, periodId: J1.id, subjectId: 1 }).some(
      (v) => v.code === "H8_MAX_CONSECUTIVE",
    ),
    false,
  );

  ctx.assignments.push({ teacherId: 1, date: D, periodId: J1.id, subjectId: 1 });
  check("さらに中2限を足すと4連続", maxRunWith(ctx, 1, D, J2.id), 4);
  check(
    "上限3を超えるので弾かれる",
    checkAdd(ctx, { teacherId: 1, date: D, periodId: J2.id, subjectId: 1 }).some(
      (v) => v.code === "H8_MAX_CONSECUTIVE",
    ),
    true,
  );

  // 間が空いていれば連続ではない。小1限だけ入っている状態に中3限を足す。
  const gapCtx = buildContext({
    teachers: [
      {
        id: 1,
        name: "テスト講師",
        active: true,
        rule: { maxPerDay: 9, maxPerWeek: 99, maxConsecutive: 3, minPerWeek: 0 },
        subjects: new Set([1]),
      },
    ],
    periods: REAL.map((x) => ({
      id: x.id,
      order: x.order,
      startTime: x.startTime,
      endTime: x.endTime,
    })),
    requests: [],
    closedDates: [],
    demands: [],
    assignments: [{ teacherId: 1, date: D, periodId: E1.id, subjectId: 1 }],
  });
  check("小1限と中3限は連続にならない", maxRunWith(gapCtx, 1, D, J3.id), 1);
}

// ============================================================
console.log("\n[H14] 同じ時間帯の別のコマには入れない");
{
  const D = "2026-09-01";
  // 中1限と高1限が同じ19:15開始。並行して開けている塾。
  const H1 = p(7, GRADE_BAND.HIGH, "1限", "19:15", "20:05", 0);
  const list = [...REAL, H1];

  const ctx = buildContext({
    teachers: [
      {
        id: 1,
        name: "テスト講師",
        active: true,
        rule: { maxPerDay: 9, maxPerWeek: 99, maxConsecutive: 9, minPerWeek: 0 },
        subjects: new Set([1]),
      },
    ],
    periods: list.map((x) => ({
      id: x.id,
      order: x.order,
      startTime: x.startTime,
      endTime: x.endTime,
    })),
    requests: list.map((x) => ({
      teacherId: 1,
      date: D,
      periodId: x.id,
      status: SHIFT.OK,
    })),
    closedDates: [],
    demands: list.map((x) => ({
      date: D,
      periodId: x.id,
      subjectId: 1,
      required: 9,
    })),
    assignments: [{ teacherId: 1, date: D, periodId: J1.id, subjectId: 1 }],
  });

  const codes = (periodId: number) =>
    checkAdd(ctx, { teacherId: 1, date: D, periodId, subjectId: 1 }).map((v) => v.code);

  check("同時刻の高1限は弾かれる", codes(H1.id).includes("H14_OVERLAP"), true);
  // 体は1つしかないので、手直しでも通してはいけない
  check(
    "手直しでも error のまま",
    checkAdd(ctx, { teacherId: 1, date: D, periodId: H1.id, subjectId: 1 }, "manual")
      .find((v) => v.code === "H14_OVERLAP")?.severity,
    "error",
  );
  check("重ならない中2限は通る", codes(J2.id).includes("H14_OVERLAP"), false);
  // 同じコマそのものは H13 の担当。二重に出さない。
  check("同じコマは H13 だけ", codes(J1.id).includes("H14_OVERLAP"), false);
  check("同じコマは H13 が出る", codes(J1.id).includes("H13_DOUBLE_BOOKED"), true);
}

// ============================================================
console.log("\n[設定] 個別の上限で、選べる形態が変わる");
{
  check("上限2なら3つ", lessonStyles(2), ["GROUP", "INDIV_1", "INDIV_2"]);
  check(
    "上限4なら5つ",
    lessonStyles(4),
    ["GROUP", "INDIV_1", "INDIV_2", "INDIV_3", "INDIV_4"],
  );
  check("1対4の表示", lessonStyleLabel("INDIV_4"), "個別 1対4");
  check("集団の表示", lessonStyleLabel("GROUP"), "集団");
  check("人数を取り出せる", indivSizeOf("INDIV_3"), 3);
  check("集団は人数なし", indivSizeOf("GROUP"), null);
  // 設定が壊れていても形態の一覧が空にならないこと。
  // 空になると、勤怠でどの形態も選べず給与が付かなくなる。
  check("0でも集団+1対1は出る", lessonStyles(0), ["GROUP", "INDIV_1"]);

  check(
    "範囲外は丸める",
    normalizeSetting({ indivMaxStudents: 999, maxGroupRooms: -3, maxIndivRooms: 2 }),
    { indivMaxStudents: 9, maxGroupRooms: 0, maxIndivRooms: 2 },
  );
  check(
    "数字でない値は既定値",
    normalizeSetting({ indivMaxStudents: NaN }),
    { indivMaxStudents: 2, maxGroupRooms: 1, maxIndivRooms: 1 },
  );
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
