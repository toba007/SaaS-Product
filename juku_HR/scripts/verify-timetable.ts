/**
 * 開講時間割の制約と、決定的な配置を確かめる。
 *   npm run verify
 *
 * ---- ここが LLM の提案を通す関門 ----
 * LLM は「出られない講師しかいない枠」を平気で提案するし、同じ生徒を同時刻に
 * 2つ置くこともある。**それを弾けなければ、動けない時間割が確定できてしまう。**
 * 提案を採るかどうかの判断はすべてここを通るので、境界を固定しておく。
 *
 * DB を使わない純粋関数なので、まとめてテストできる。
 */
import {
  buildAvailability,
  checkPlacements,
  foldWeekly,
  greedyPlace,
  isAllowed,
  reliableTeachers,
  slotKey,
  sortPlacements,
  type Availability,
  type CheckInput,
  type PeriodLite,
  type Placement,
  type Target,
} from "../lib/timetable";
import { buildPrompt, extractCode } from "../lib/ai/propose-timetable";
import { GRADE_BAND, SHIFT } from "../lib/constants";

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
const MON = 1;
const TUE = 2;

/** 中学生の3コマ */
const J1: PeriodLite = { id: 11, gradeBand: GRADE_BAND.JUNIOR, name: "1限", startTime: "19:15", endTime: "20:05", order: 0 };
const J2: PeriodLite = { id: 12, gradeBand: GRADE_BAND.JUNIOR, name: "2限", startTime: "20:10", endTime: "21:00", order: 1 };
const J3: PeriodLite = { id: 13, gradeBand: GRADE_BAND.JUNIOR, name: "3限", startTime: "21:05", endTime: "21:55", order: 2 };
/** 小学生の1コマ */
const E1: PeriodLite = { id: 21, gradeBand: GRADE_BAND.ELEM, name: "1限", startTime: "17:40", endTime: "18:20", order: 0 };
const PERIODS = [E1, J1, J2, J3];

function target(over: Partial<Target> & { key: string }): Target {
  return {
    kind: "CLASS",
    refId: 1,
    label: over.key,
    subjectId: ENGLISH,
    gradeBand: GRADE_BAND.JUNIOR,
    studentIds: [],
    slots: 1,
    ...over,
  };
}

/** 指定した枠だけ「講師がいる」ことにする */
function avail(slots: [number, number][], teachers = [1]): Availability {
  const m: Availability = new Map();
  for (const p of PERIODS) {
    for (const dow of [MON, TUE]) {
      const has = slots.some(([d, pid]) => d === dow && pid === p.id);
      m.set(slotKey({ dayOfWeek: dow, periodId: p.id }), new Set(has ? teachers : []));
    }
  }
  return m;
}

function input(
  targets: Target[],
  availability: [string, Availability][],
  over: Partial<CheckInput> = {},
): CheckInput {
  return {
    targets,
    periods: PERIODS,
    availability: new Map(availability),
    maxGroupRooms: 9,
    maxIndivRooms: 9,
    indivMaxStudents: 4,
    ...over,
  };
}

// ============================================================
console.log("\n[希望の畳み込み] 毎回出られる人だけを候補にする");
{
  // 4月の火曜が4回あるとして、3回だけ OK の講師は候補にしない。
  // クラス担当にすると、残り1回が必ず穴になる。
  const dates = ["2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28"]; // すべて火曜
  const reqs = dates.map((d, i) => ({
    teacherId: 1,
    date: d,
    periodId: J1.id,
    status: i === 3 ? SHIFT.NG : SHIFT.OK,
  }));
  const w = foldWeekly(reqs, dates, [J1.id]);
  check(
    "3/4回では候補にならない",
    [...reliableTeachers(w, { dayOfWeek: TUE, periodId: J1.id })],
    [],
  );
  check(
    "緩めれば候補になる",
    [...reliableTeachers(w, { dayOfWeek: TUE, periodId: J1.id }, 0.7)],
    [1],
  );

  const all = dates.map((d) => ({ teacherId: 2, date: d, periodId: J1.id, status: SHIFT.OK }));
  check(
    "4/4回なら候補になる",
    [...reliableTeachers(foldWeekly(all, dates, [J1.id]), { dayOfWeek: TUE, periodId: J1.id })],
    [2],
  );

  // 未回答は「出られる」に数えない
  const silent = foldWeekly([], dates, [J1.id]);
  check("未回答は候補にしない", reliableTeachers(silent, { dayOfWeek: TUE, periodId: J1.id }).size, 0);

  // 担当科目で絞る
  const a = buildAvailability(
    foldWeekly(all, dates, [J1.id]),
    [{ dayOfWeek: TUE, periodId: J1.id }],
    ENGLISH,
    (t, s) => t === 2 && s === ENGLISH,
  );
  check("科目を担当できる人だけ", a.get(`${TUE}:${J1.id}`)?.size, 1);
  const b = buildAvailability(
    foldWeekly(all, dates, [J1.id]),
    [{ dayOfWeek: TUE, periodId: J1.id }],
    MATH,
    (t, s) => t === 2 && s === ENGLISH,
  );
  check("担当できない科目は空", b.get(`${TUE}:${J1.id}`)?.size, 0);
}

// ============================================================
console.log("\n[T1] 学年帯に合わないコマには置けない");
{
  const t = target({ key: "class:1", gradeBand: GRADE_BAND.ELEM });
  const inp = input([t], [["class:1", avail([[TUE, E1.id], [TUE, J1.id]])]]);
  check(
    "小学生を小学生のコマへ",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: TUE, periodId: E1.id }], inp)
      .map((x) => x.code),
    [],
  );
  check(
    "小学生を中学生のコマへ置くと弾く",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id }], inp)
      .map((x) => x.code),
    ["T1_BAND"],
  );
  // 高校生は登録が無ければ中学生の枠を使う（lib/periods.ts と同じ読み替え）
  const h = target({ key: "class:2", gradeBand: GRADE_BAND.HIGH });
  check(
    "高校生は中学生のコマを使える",
    checkPlacements(
      [{ targetKey: "class:2", dayOfWeek: TUE, periodId: J1.id }],
      input([h], [["class:2", avail([[TUE, J1.id]])]]),
    ).map((x) => x.code),
    [],
  );
}

console.log("\n[T2] 出られる講師がいない枠には置けない");
{
  const t = target({ key: "class:1" });
  // 火曜1限にだけ講師がいる
  const inp = input([t], [["class:1", avail([[TUE, J1.id]])]]);
  check(
    "講師がいる枠は通る",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id }], inp).length,
    0,
  );
  // ここが LLM のいちばんよくある間違い
  check(
    "講師がいない枠は弾く",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: MON, periodId: J1.id }], inp)
      .map((x) => x.code),
    ["T2_NO_TEACHER"],
  );
}

console.log("\n[T3] 同じ生徒が同じ枠に2つ入らない");
{
  const a = target({ key: "class:1", subjectId: ENGLISH, studentIds: [7, 8] });
  const b = target({ key: "class:2", subjectId: MATH, studentIds: [8, 9] });
  const inp = input([a, b], [
    ["class:1", avail([[TUE, J1.id], [TUE, J2.id]])],
    ["class:2", avail([[TUE, J1.id], [TUE, J2.id]])],
  ]);
  // 生徒8 が両方に入っている
  check(
    "同時刻は弾く",
    checkPlacements(
      [
        { targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id },
        { targetKey: "class:2", dayOfWeek: TUE, periodId: J1.id },
      ],
      inp,
    ).map((x) => x.code),
    ["T3_STUDENT_CLASH"],
  );
  check(
    "コマをずらせば通る",
    checkPlacements(
      [
        { targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id },
        { targetKey: "class:2", dayOfWeek: TUE, periodId: J2.id },
      ],
      inp,
    ).length,
    0,
  );
}

console.log("\n[T4] 教室数の上限");
{
  const ts = [1, 2, 3].map((i) => target({ key: `class:${i}`, refId: i }));
  const inp = input(
    ts,
    ts.map((t) => [t.key, avail([[TUE, J1.id]])] as [string, Availability]),
    { maxGroupRooms: 2 },
  );
  const at = (k: string): Placement => ({ targetKey: k, dayOfWeek: TUE, periodId: J1.id });
  /** 教室数だけを見る。置いていない対象のコマ数不足（T5）はここでは関係ない。 */
  const rooms = (ps: Placement[], i: CheckInput) =>
    checkPlacements(ps, i).filter((x) => x.code === "T4_OVER_ROOMS").map((x) => x.code);

  check("2クラスまでは通る", rooms([at("class:1"), at("class:2")], inp), []);
  check("3クラス目で弾く", rooms([at("class:1"), at("class:2"), at("class:3")], inp), [
    "T4_OVER_ROOMS",
  ]);

  // 個別は生徒をまとめられるので、人数からブース数を出す
  const indiv = [1, 2, 3, 4, 5].map((i) =>
    target({ key: `indiv:${i}`, kind: "INDIV", refId: i, studentIds: [100 + i] }),
  );
  const inp2 = input(
    indiv,
    indiv.map((t) => [t.key, avail([[TUE, J1.id]])] as [string, Availability]),
    { maxIndivRooms: 1, indivMaxStudents: 4 },
  );
  const all = indiv.map((t) => ({ targetKey: t.key, dayOfWeek: TUE, periodId: J1.id }));
  // 5人・上限4 → 2ブース必要だが1室しかない
  check("5人を1ブースには入れられない", rooms(all, inp2), ["T4_OVER_ROOMS"]);
  check("4人なら1ブースに収まる", rooms(all.slice(0, 4), inp2), []);
}

console.log("\n[T7] 1人いれば足りる、とは限らない");
{
  // 個別5人・上限4 → 2ブース＝講師2人が要る。担当できる講師が1人だと成立しない。
  const indiv = [1, 2, 3, 4, 5].map((i) =>
    target({ key: `indiv:${i}`, kind: "INDIV", refId: i, studentIds: [100 + i] }),
  );
  const one = input(
    indiv,
    indiv.map((t) => [t.key, avail([[TUE, J1.id]], [1])] as [string, Availability]),
    { indivMaxStudents: 4, maxIndivRooms: 9 },
  );
  const all = indiv.map((t) => ({ targetKey: t.key, dayOfWeek: TUE, periodId: J1.id }));
  const short = (i: CheckInput, ps = all) =>
    checkPlacements(ps, i).filter((x) => x.code === "T7_TEACHER_SHORTAGE").length;

  check("5人を1人では見られない", short(one), 1);

  const two = input(
    indiv,
    indiv.map((t) => [t.key, avail([[TUE, J1.id]], [1, 2])] as [string, Availability]),
    { indivMaxStudents: 4, maxIndivRooms: 9 },
  );
  check("2人いれば足りる", short(two), 0);
  check("4人までなら1人で足りる", short(one, all.slice(0, 4)), 0);

  // 講師が0人の枠は T2 の担当。同じ問題に2つメッセージを出さない。
  const none = input(
    indiv,
    indiv.map((t) => [t.key, avail([])] as [string, Availability]),
  );
  check("0人のときは T7 を出さない", short(none), 0);
  check(
    "0人のときは T2 が出る",
    checkPlacements(all, none).some((x) => x.code === "T2_NO_TEACHER"),
    true,
  );

  // 科目をまたぐと1人の講師を取り合う。英語と数学が同じ枠で1人ずつ要るのに、
  // 出られるのが1人だけなら成立しない。
  const a = target({ key: "class:1", refId: 1, subjectId: ENGLISH });
  const b = target({ key: "class:2", refId: 2, subjectId: MATH });
  const both = [
    { targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id },
    { targetKey: "class:2", dayOfWeek: TUE, periodId: J1.id },
  ];
  const shared = input(
    [a, b],
    [
      ["class:1", avail([[TUE, J1.id]], [1])],
      ["class:2", avail([[TUE, J1.id]], [1])],
    ],
    { slotTeachers: new Map([[`${TUE}:${J1.id}`, new Set([1])]]) },
  );
  check("同時に2科目を1人では持てない", short(shared, both), 1);

  const shared2 = input(
    [a, b],
    [
      ["class:1", avail([[TUE, J1.id]], [1])],
      ["class:2", avail([[TUE, J1.id]], [2])],
    ],
    { slotTeachers: new Map([[`${TUE}:${J1.id}`, new Set([1, 2])]]) },
  );
  check("2人いれば持てる", short(shared2, both), 0);
}


console.log("\n[T5/T6] コマ数と、存在しない指定");
{
  const t = target({ key: "class:1", slots: 2 });
  const inp = input([t], [["class:1", avail([[TUE, J1.id], [TUE, J2.id]])]]);
  check(
    "1コマしか置いていないと不足",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id }], inp)
      .map((x) => x.code),
    ["T5_SLOT_COUNT"],
  );
  check(
    "2コマなら通る",
    checkPlacements(
      [
        { targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id },
        { targetKey: "class:1", dayOfWeek: TUE, periodId: J2.id },
      ],
      inp,
    ).length,
    0,
  );
  // LLM が知らない対象やコマを作ってくることがある
  check(
    "知らない対象は弾く",
    checkPlacements([{ targetKey: "class:999", dayOfWeek: TUE, periodId: J1.id }], inp)
      .some((x) => x.code === "T6_UNKNOWN"),
    true,
  );
  check(
    "知らないコマは弾く",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: TUE, periodId: 999 }], inp)
      .some((x) => x.code === "T6_UNKNOWN"),
    true,
  );
  check(
    "曜日が範囲外なら弾く",
    checkPlacements([{ targetKey: "class:1", dayOfWeek: 9, periodId: J1.id }], inp)
      .some((x) => x.code === "T6_UNKNOWN"),
    true,
  );
}

// ============================================================
console.log("\n[決定的な配置] LLM が無くても時間割が出る");
{
  const ts = [
    target({ key: "class:1", refId: 1, studentIds: [1, 2] }),
    target({ key: "class:2", refId: 2, subjectId: MATH, studentIds: [1, 2] }),
  ];
  const inp = input(ts, [
    ["class:1", avail([[TUE, J1.id], [TUE, J2.id]])],
    ["class:2", avail([[TUE, J1.id], [TUE, J2.id]])],
  ]);
  const r = greedyPlace(inp);
  check("2件とも置けた", r.placements.length, 2);
  check("違反なし", isAllowed(checkPlacements(r.placements, inp)), true);
  // 同じ生徒が両方にいるので、別のコマに分かれるはず
  check(
    "生徒が重ならないように分かれる",
    new Set(r.placements.map((p) => p.periodId)).size,
    2,
  );

  // 同じ入力なら同じ結果。ここが崩れると「やり直せば有利になる」と疑われる
  const again = greedyPlace(inp);
  check("2回目も同じ", JSON.stringify(again.placements), JSON.stringify(r.placements));
}

console.log("\n[決定的な配置] 置けないものは理由を付けて返す");
{
  const t = target({ key: "class:1" });
  // どの枠にも講師がいない
  const inp = input([t], [["class:1", avail([])]]);
  const r = greedyPlace(inp);
  check("置けない", r.placements.length, 0);
  check("理由が付く", r.unplaced[0]?.reason.includes("講師"), true);
  check("必要なコマ数を出す", r.unplaced[0]?.needed, 1);
}

console.log("\n[決定的な配置] 個別は同じ枠に寄せる");
{
  // 同じ科目の個別3人。まとめれば講師1人で済む。
  const ts = [1, 2, 3].map((i) =>
    target({ key: `indiv:${i}`, kind: "INDIV", refId: i, studentIds: [100 + i] }),
  );
  const inp = input(
    ts,
    ts.map((t) => [t.key, avail([[TUE, J1.id], [TUE, J2.id]])] as [string, Availability]),
    { indivMaxStudents: 4, maxIndivRooms: 2 },
  );
  const r = greedyPlace(inp);
  check("3件とも置けた", r.placements.length, 3);
  check(
    "同じ枠にまとまる",
    new Set(r.placements.map((p) => slotKey(p))).size,
    1,
  );
}

console.log("\n[決定的な配置] 決まっている枠は動かさない");
{
  const ts = [
    target({ key: "class:1", refId: 1 }),
    target({ key: "class:2", refId: 2, subjectId: MATH }),
  ];
  const inp = input(ts, [
    ["class:1", avail([[TUE, J1.id], [TUE, J2.id]])],
    ["class:2", avail([[TUE, J1.id], [TUE, J2.id]])],
  ]);
  const fixed: Placement[] = [{ targetKey: "class:1", dayOfWeek: TUE, periodId: J2.id }];
  const r = greedyPlace(inp, fixed);
  check(
    "固定した枠が残る",
    r.placements.some((p) => p.targetKey === "class:1" && p.periodId === J2.id),
    true,
  );
  check("残りも置かれる", r.placements.length, 2);
}

// ============================================================
console.log("\n[LLM への入力] 生徒の実名を出さない");
{
  const t = target({ key: "indiv:1", kind: "INDIV", label: "国語", studentIds: [42] });
  const inp = input([t], [["indiv:1", avail([[TUE, J1.id]])]]);

  const withReal = buildPrompt({ check: inp }).text;
  check("仮名化しないと生徒IDが出る", withReal.includes("生徒42"), true);

  const masked = buildPrompt({
    check: inp,
    pseudonym: (id) => `生徒${String(id).padStart(3, "0")}`,
  }).text;
  check("仮名化すると置き換わる", masked.includes("生徒042"), true);

  // 置ける枠と、置けない枠の区別が伝わること
  check("置ける枠の番号が出る", /S\d/.test(masked), true);
  check("上限が伝わる", masked.includes("4人まで"), true);

  // 要望を渡せる
  const noted = buildPrompt({ check: inp, note: "金曜は避けてください" }).text;
  check("要望が入る", noted.includes("金曜は避けて"), true);
}

console.log("\n[LLM の応答] 表記の揺れを吸収する");
{
  // 小さいモデルは「T1」と指示してもラベルを添えて返す（実測）。
  // 完全一致で拾うと全部落ちるので、先頭の番号だけを見る。
  check("番号だけ", extractCode("T1", "T"), "T1");
  check("ラベル付き", extractCode("T1 中1英語", "T"), "T1");
  check("かっこ付き", extractCode("S1 (月1限)", "S"), "S1");
  check("前後の空白", extractCode("  T12  ", "T"), "T12");
  check("小文字", extractCode("t3", "T"), "T3");
  check("ゼロ埋めは正規化する", extractCode("T007", "T"), "T7");

  // ここを緩めすぎると、モデルの作り話を通してしまう
  check("接頭辞が違えば拾わない", extractCode("S1", "T"), null);
  check("数字が無ければ拾わない", extractCode("Txx", "T"), null);
  check("途中に番号があっても拾わない", extractCode("枠 T1", "T"), null);
  check("文字列でなければ拾わない", extractCode(3, "T"), null);
  check("空なら拾わない", extractCode("", "T"), null);

  // 候補をそのまま返してくることがある（実測）。先頭だけ採ると、
  // モデルがしていない判断を「選んだ」ことにしてしまう。
  check("範囲は決めていない扱い", extractCode("S1〜S18", "S"), null);
  check("波ダッシュでも同じ", extractCode("S1~S18", "S"), null);
  check("列挙も決めていない扱い", extractCode("S1,S2", "S"), null);
  check("読点の列挙も同じ", extractCode("S1、S2", "S"), null);
  check("ラベルは決めている扱い", extractCode("S1 (月1限)", "S"), "S1");
}


console.log("\n[並び] 実行のたびに変わらない");
{
  const ps: Placement[] = [
    { targetKey: "class:2", dayOfWeek: TUE, periodId: J1.id },
    { targetKey: "class:1", dayOfWeek: MON, periodId: J2.id },
    { targetKey: "class:1", dayOfWeek: TUE, periodId: J1.id },
  ];
  check(
    "曜日→コマ→対象の順",
    sortPlacements(ps).map((p) => `${p.dayOfWeek}:${p.periodId}:${p.targetKey}`),
    [`${MON}:${J2.id}:class:1`, `${TUE}:${J1.id}:class:1`, `${TUE}:${J1.id}:class:2`],
  );
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
