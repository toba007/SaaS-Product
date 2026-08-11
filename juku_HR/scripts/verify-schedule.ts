/**
 * 受講予定から必要人数を出す部分を確かめる。
 *   npm run verify
 *
 * ここが間違うと、**間違った人数のシフトが「正しい」として確定できてしまう。**
 * 多く出れば人が余り、少なく出れば当日足りない。どちらも気づくのが遅い。
 *
 * 特に押さえたいのは3つ。
 *   - 個別を何人まとめられるかは**塾の設定**で変わる（1対2までの塾と1対4の塾がある）
 *   - **1対1を希望している生徒はまとめない**（契約と違う授業になる）
 *   - 配置し忘れた生徒は**数えられない**ので、不備として拾えること
 *
 * DB を使わない純粋関数なので、境界をまとめて固定しておく。
 */
import {
  individualDemand,
  mergeDemand,
  scheduledOn,
  schedulingShortfalls,
  studentClashes,
  type ScheduleLite,
  type SubjectLinkLite,
} from "../lib/schedule";
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

const TERM = { from: "2026-04-06", to: "2026-07-20" };
const ENGLISH = 1;
const MATH = 2;
const P1 = 11;
const P2 = 12;

/** 2026-04-07 は火曜 */
const TUE = "2026-04-07";
const WED = "2026-04-08";

let seq = 0;
function link(
  studentId: number,
  subjectId = ENGLISH,
  format: string = LESSON_STYLE.INDIV_2,
  slotsPerWeek = 1,
  active = true,
): SubjectLinkLite {
  return { id: ++seq, studentId, subjectId, format, slotsPerWeek, active };
}
function sched(
  studentSubjectId: number,
  dayOfWeek: number | null,
  periodId = P1,
  over: Partial<ScheduleLite> = {},
): ScheduleLite {
  return {
    studentSubjectId,
    dayOfWeek,
    date: null,
    periodId,
    fromDate: TERM.from,
    toDate: TERM.to,
    ...over,
  };
}

// ============================================================
console.log("\n[開講判定] 曜日と日付");
{
  check("毎週火曜は火曜に開く", scheduledOn(sched(1, 2), TUE), true);
  check("毎週火曜は水曜に開かない", scheduledOn(sched(1, 2), WED), false);
  // 学期の外は開かない。前の学期の配置が今学期に効いてはいけない。
  check("期間より前は開かない", scheduledOn(sched(1, 2), "2026-04-01"), false);
  check("期間より後は開かない", scheduledOn(sched(1, 2), "2026-07-21"), false);
  check("開始日ちょうどは開く", scheduledOn(sched(1, 1), "2026-04-06"), true);

  // 講習は日付で持つ
  const spot = sched(1, null, P1, { date: "2026-08-05", fromDate: "2026-08-05", toDate: "2026-08-05" });
  check("日付指定はその日に開く", scheduledOn(spot, "2026-08-05"), true);
  check("日付指定は別の日に開かない", scheduledOn(spot, "2026-08-06"), false);

  // 曜日も日付も無い行は壊れている。毎日開くことにしてはいけない。
  check("どちらも無い行は開かない", scheduledOn(sched(1, null), TUE), false);
}

// ============================================================
console.log("\n[個別の必要人数] 塾の設定でまとめ方が変わる");
{
  const links = [1, 2, 3, 4].map((i) => link(i));
  const scheds = links.map((l) => sched(l.id, 2));

  // 上限4なら1人でみられる
  check(
    "4人・上限4 → 講師1人",
    individualDemand(links, scheds, [TUE], 4).map((d) => d.required),
    [1],
  );
  // 同じ生徒数でも、上限2の塾なら2人要る
  check(
    "4人・上限2 → 講師2人",
    individualDemand(links, scheds, [TUE], 2).map((d) => d.required),
    [2],
  );
  check(
    "4人・上限1 → 講師4人",
    individualDemand(links, scheds, [TUE], 1).map((d) => d.required),
    [4],
  );
  // 割り切れないときは切り上げ。切り捨てると当日足りない。
  check(
    "5人・上限4 → 講師2人（切り上げ）",
    individualDemand([...links, link(5)], [...scheds, sched(seq, 2)], [TUE], 4).map(
      (d) => d.required,
    ),
    [2],
  );
  // 設定が壊れていても0で割らない
  check(
    "上限0でも1人ずつとして数える",
    individualDemand(links, scheds, [TUE], 0).map((d) => d.required),
    [4],
  );
}

console.log("\n[個別の必要人数] 1対1はまとめない");
{
  const solo = link(1, ENGLISH, LESSON_STYLE.INDIV_1);
  const pooled = [2, 3, 4, 5, 6].map((i) => link(i, ENGLISH, LESSON_STYLE.INDIV_2));
  const all = [solo, ...pooled];
  const scheds = all.map((l) => sched(l.id, 2));

  // 1対1が1人 + その他5人を上限4でまとめる → 1 + 2 = 3
  check(
    "1対1は1人で1コマを占有する",
    individualDemand(all, scheds, [TUE], 4).map((d) => d.required),
    [3],
  );
  check(
    "1対1だけなら人数ぶん",
    individualDemand([solo], [sched(solo.id, 2)], [TUE], 4).map((d) => d.required),
    [1],
  );
}

console.log("\n[個別の必要人数] 分ける軸");
{
  const a = link(1, ENGLISH);
  const b = link(2, MATH);
  const scheds = [sched(a.id, 2, P1), sched(b.id, 2, P1)];
  // 科目が違えば別の講師が要る。まとめてはいけない。
  check(
    "科目が違えば分かれる",
    individualDemand([a, b], scheds, [TUE], 4).length,
    2,
  );

  const c = link(3, ENGLISH);
  const d = link(4, ENGLISH);
  // コマが違えば別の枠
  check(
    "コマが違えば分かれる",
    individualDemand([c, d], [sched(c.id, 2, P1), sched(d.id, 2, P2)], [TUE], 4).length,
    2,
  );

  // やめた科目は数えない
  const quit = link(5, ENGLISH, LESSON_STYLE.INDIV_2, 1, false);
  check(
    "やめた科目は数えない",
    individualDemand([quit], [sched(quit.id, 2)], [TUE], 4).length,
    0,
  );
  // 集団はクラスの時間割で数えるので、ここでは出さない
  const grp = link(6, ENGLISH, LESSON_STYLE.GROUP);
  check(
    "集団はここでは数えない",
    individualDemand([grp], [sched(grp.id, 2)], [TUE], 4).length,
    0,
  );
}

console.log("\n[合算] 集団と個別を足す");
{
  const group = [
    { date: TUE, periodId: P1, subjectId: ENGLISH, format: LESSON_STYLE.GROUP, required: 2 },
  ];
  const indiv = [
    { date: TUE, periodId: P1, subjectId: ENGLISH, format: LESSON_STYLE.INDIV_2, required: 1 },
  ];
  // 形態が違えば別の行のまま。集団2人と個別1人で、その枠は合計3人要る。
  check("形態が違えば別の行", mergeDemand(group, indiv).length, 2);
  check(
    "同じ形態なら合算",
    mergeDemand(group, group).map((d) => d.required),
    [4],
  );
  // 並びが実行のたびに変わると、結果を見比べられない
  check(
    "並びが決まっている",
    mergeDemand(indiv, group).map((d) => d.format),
    [LESSON_STYLE.GROUP, LESSON_STYLE.INDIV_2],
  );
}

// ============================================================
console.log("\n[不備] 配置し忘れた生徒を拾う");
{
  const want2 = link(1, ENGLISH, LESSON_STYLE.INDIV_2, 2);
  // 週2コマ希望なのに1コマしか置いていない
  const s = schedulingShortfalls([want2], [sched(want2.id, 2)], TERM.from, TERM.to);
  check("足りない件数", s.length, 1);
  check("希望と実績を出す", [s[0]?.want, s[0]?.placed], [2, 1]);

  check(
    "足りていれば出ない",
    schedulingShortfalls(
      [want2],
      [sched(want2.id, 2), sched(want2.id, 3)],
      TERM.from,
      TERM.to,
    ).length,
    0,
  );

  // 前の学期の配置を今学期のぶんとして数えない
  const old = sched(want2.id, 2, P1, { fromDate: "2026-01-08", toDate: "2026-03-24" });
  check(
    "期間外の配置は数えない",
    schedulingShortfalls([want2], [old], TERM.from, TERM.to)[0]?.placed,
    0,
  );

  // 週0コマのままなら、配置が無くても不備ではない（まだ聞いていないだけ）
  const zero = link(2, MATH, LESSON_STYLE.INDIV_2, 0);
  check("週0コマは不備にしない", schedulingShortfalls([zero], [], TERM.from, TERM.to).length, 0);

  // 集団はクラスへの振り分けで見るので、ここでは扱わない
  const grp = link(3, ENGLISH, LESSON_STYLE.GROUP, 2);
  check("集団は対象外", schedulingShortfalls([grp], [], TERM.from, TERM.to).length, 0);
}

console.log("\n[不備] 同じ生徒が同じ枠に2つ");
{
  const a = link(1, ENGLISH);
  const b = link(1, MATH); // 同じ生徒の別科目
  // 火曜1限に英語と数学。体は1つなので成立しない。
  const c = studentClashes([a, b], [sched(a.id, 2, P1), sched(b.id, 2, P1)]);
  check("重なりを拾う", c.length, 1);
  check("科目を両方出す", c[0]?.subjectIds, [ENGLISH, MATH]);

  check(
    "コマが違えば重ならない",
    studentClashes([a, b], [sched(a.id, 2, P1), sched(b.id, 2, P2)]).length,
    0,
  );
  check(
    "曜日が違えば重ならない",
    studentClashes([a, b], [sched(a.id, 2, P1), sched(b.id, 3, P1)]).length,
    0,
  );

  // 別の生徒が同じ枠にいるのは正常（それが「まとめる」ということ）
  const other = link(2, ENGLISH);
  check(
    "別の生徒どうしは重なりではない",
    studentClashes([a, other], [sched(a.id, 2, P1), sched(other.id, 2, P1)]).length,
    0,
  );
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
