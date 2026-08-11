/**
 * 自動割当エンジンを確かめる。
 *   npm run verify
 *
 * 要件定義の完了条件（AC-01〜AC-15）に対応させてある。
 * ここが通らないうちは自動作成を画面に出さない。
 */
import {
  DEFAULT_WEIGHTS,
  generate,
  type AutoInput,
  type DemandRow,
  type RequestRow,
} from "../lib/shifts-auto";
import type { AssignmentLite, PeriodLite, TeacherState } from "../lib/shifts-rules";
import { LESSON_STYLE, SHIFT } from "../lib/constants";
import { datesBetween } from "../lib/dates";

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
function checkTrue(label: string, actual: boolean) {
  check(label, actual, true);
}

const RULE = { maxPerDay: 4, maxPerWeek: 12, maxConsecutive: 3, minPerWeek: 0 };

function teacher(
  id: number,
  subjects: number[],
  over: Partial<TeacherState> = {},
): TeacherState {
  return {
    id,
    name: `講師${id}`,
    active: true,
    rule: { ...RULE },
    subjects: new Set(subjects),
    ...over,
  };
}

/** 19:15 から 50分・間5分で3コマ。中学生の時間割を模したもの。 */
const PERIODS: PeriodLite[] = [
  { id: 11, order: 0, startTime: "19:15", endTime: "20:05" },
  { id: 12, order: 1, startTime: "20:10", endTime: "21:00" },
  { id: 13, order: 2, startTime: "21:05", endTime: "21:55" },
];

const D = "2026-09-01"; // 火曜

const demand = (
  subjectId: number,
  required: number,
  periodId = 11,
  date = D,
): DemandRow => ({
  date,
  periodId,
  subjectId,
  format: LESSON_STYLE.INDIV_2,
  required,
});

const req = (
  teacherId: number,
  periodId = 11,
  status: string = SHIFT.OK,
  date = D,
): RequestRow => ({ teacherId, date, periodId, status });

// ============================================================
console.log("\n[AC-01〜08] ハード制約を破らない");

{
  // NG の講師と OK の講師を並べる
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1, 11, SHIFT.NG), req(2, 11, SHIFT.OK)],
    closedDates: [],
    demands: [demand(1, 2)],
  });
  check("NG の講師に割り当てない", r.placements.filter((p) => p.teacherId === 1).length, 0);
  check("OK の講師には割り当てる", r.placements.filter((p) => p.teacherId === 2).length, 1);
}

{
  // 講師2は回答していない
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1)],
    closedDates: [],
    demands: [demand(1, 2)],
  });
  check("未回答の講師に割り当てない", r.placements.filter((p) => p.teacherId === 2).length, 0);
}

{
  const r = generate({
    teachers: [teacher(1, [1])],
    periods: PERIODS,
    requests: [req(1)],
    closedDates: [D],
    demands: [demand(1, 1)],
  });
  check("休校日に割り当てない", r.placements.length, 0);
}

{
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1]), teacher(3, [1])],
    periods: PERIODS,
    requests: [req(1), req(2), req(3)],
    closedDates: [],
    demands: [demand(1, 2)],
  });
  check("必要人数を超えない", r.placements.length, 2);
}

{
  // 上限2の講師に、3コマぶんの需要をぶつける
  const r = generate({
    teachers: [teacher(1, [1], { rule: { ...RULE, maxPerDay: 2 } })],
    periods: PERIODS,
    requests: [req(1, 11), req(1, 12), req(1, 13)],
    closedDates: [],
    demands: [demand(1, 1, 11), demand(1, 1, 12), demand(1, 1, 13)],
  });
  check("1日の上限を超えない", r.placements.length, 2);
}

{
  const r = generate({
    teachers: [teacher(1, [1], { active: false }), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 2)],
  });
  check("退職者に割り当てない", r.placements.filter((p) => p.teacherId === 1).length, 0);
}

{
  // 講師1は数学しか担当できないのに、英語の需要がある
  const r = generate({
    teachers: [teacher(1, [2]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 2)],
  });
  check("担当できない科目に割り当てない", r.placements.filter((p) => p.teacherId === 1).length, 0);
  check("担当できる講師だけ入る", r.placements.length, 1);
}

{
  // 同じコマに英語と数学の需要。1人しかいない講師は片方にしか入れない。
  const r = generate({
    teachers: [teacher(1, [1, 2])],
    periods: PERIODS,
    requests: [req(1)],
    closedDates: [],
    demands: [demand(1, 1), demand(2, 1)],
  });
  check("同じコマに二重に入れない", r.placements.length, 1);
}

{
  const locked: AssignmentLite[] = [
    { teacherId: 1, date: D, periodId: 11, subjectId: 1 },
  ];
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 2)],
    locked,
  });
  // ロックぶんを差し引いて、残り1人だけ埋める
  check("ロックぶんを差し引く", r.placements.length, 1);
  check("ロックされた講師を重複させない", r.placements[0]?.teacherId, 2);
}

// ============================================================
console.log("\n[AC-09] 同じ入力なら同じ結果（再現性）");

{
  const input: AutoInput = {
    teachers: [1, 2, 3, 4, 5].map((i) => teacher(i, [1, 2])),
    periods: PERIODS,
    requests: [1, 2, 3, 4, 5].flatMap((i) =>
      PERIODS.map((p) => req(i, p.id, i % 2 === 0 ? SHIFT.PREFER : SHIFT.OK)),
    ),
    closedDates: [],
    demands: PERIODS.flatMap((p) => [demand(1, 2, p.id), demand(2, 1, p.id)]),
  };

  const first = JSON.stringify(generate(input).placements);
  let same = true;
  for (let i = 0; i < 9; i++) {
    if (JSON.stringify(generate(input).placements) !== first) same = false;
  }
  // 実行のたびに結果が変わると「やり直せば有利になる」と疑われ、公平性の主張が崩れる
  checkTrue("10回実行して同じ結果", same);
}

// ============================================================
console.log("\n[AC-10] 偏りが2コマ以内に収まる");

{
  // 6人が全コマ出られる。needs 9コマぶん。均等なら1〜2コマずつ。
  const teachers = [1, 2, 3, 4, 5, 6].map((i) => teacher(i, [1]));
  const r = generate({
    teachers,
    periods: PERIODS,
    requests: teachers.flatMap((t) => PERIODS.map((p) => req(t.id, p.id))),
    closedDates: [],
    demands: PERIODS.map((p) => demand(1, 3, p.id)),
  });
  check("9コマ埋まる", r.placements.length, 9);
  checkTrue(`偏りは2コマ以内（実際 ${r.summary.spread}）`, r.summary.spread <= 2);
}

// ============================================================
console.log("\n[AC-12] ◎できれば入りたい を優先する");

{
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1, 11, SHIFT.OK), req(2, 11, SHIFT.PREFER)],
    closedDates: [],
    demands: [demand(1, 1)],
  });
  check("PREFER の講師が選ばれる", r.placements[0]?.teacherId, 2);
}

// ============================================================
console.log("\n[AC-15a] その科目の習熟度が高い講師を優先する");

{
  const levels = new Map<string, number>([
    ["1:1", 1], // 講師1は英語が「可」
    ["2:1", 3], // 講師2は英語が「専門」
  ]);
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 1)],
    levels,
  });
  check("専門の講師が選ばれる", r.placements[0]?.teacherId, 2);
}

// ============================================================
console.log("\n[AC-13/15b] 埋まらない理由を正しく分ける");

{
  // 誰も出られない
  const r = generate({
    teachers: [teacher(1, [1])],
    periods: PERIODS,
    requests: [],
    closedDates: [],
    demands: [demand(1, 1)],
  });
  check("誰も出られない", r.unfilled[0]?.reason, "NO_CANDIDATE");
}

{
  // 出られる人はいるが、誰も英語を担当できない。
  // ここを NO_CANDIDATE と取り違えると、現場は「人手不足」と誤解して募集をかけてしまう。
  const r = generate({
    teachers: [teacher(1, [2]), teacher(2, [2])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 1)],
  });
  check("科目を担当できる人がいない", r.unfilled[0]?.reason, "NO_SUBJECT_TEACHER");
}

{
  // 候補は1人だけ、必要は3人
  const r = generate({
    teachers: [teacher(1, [1])],
    periods: PERIODS,
    requests: [req(1)],
    closedDates: [],
    demands: [demand(1, 3)],
  });
  check("候補が足りない", r.unfilled[0]?.reason, "DEMAND_EXCEEDS_SUPPLY");
  check("不足数", r.unfilled[0]?.shortage, 2);
}

{
  // 候補は足りているが、全員が上限に達している
  const r = generate({
    teachers: [1, 2].map((i) => teacher(i, [1], { rule: { ...RULE, maxPerDay: 1 } })),
    periods: PERIODS,
    requests: [1, 2].flatMap((i) => [req(i, 11), req(i, 12)]),
    closedDates: [],
    demands: [demand(1, 2, 11), demand(1, 2, 12)],
  });
  const second = r.unfilled.find((u) => u.periodId === 12);
  check("全員が上限", second?.reason, "ALL_AT_LIMIT");
}

// ============================================================
console.log("\n[AC-14] 週の下限コマ数を満たす");

{
  // 講師2に下限2を設定。講師1は下限なし。
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1], { rule: { ...RULE, minPerWeek: 2 } })],
    periods: PERIODS,
    requests: [1, 2].flatMap((i) => PERIODS.map((p) => req(i, p.id))),
    closedDates: [],
    demands: PERIODS.map((p) => demand(1, 1, p.id)),
  });
  const t2 = r.loads.find((l) => l.teacherId === 2)!;
  checkTrue(`下限2を満たす（実際 ${t2.assigned}コマ）`, t2.assigned >= 2);
}

// ============================================================
console.log("\n[AC-15d] 希少な科目が先に埋まる");

{
  // 英語は3人が担当できる。理科は講師1だけ。
  // 講師1を英語に取られると理科が埋まらないので、理科を先に確保したい。
  const r = generate({
    teachers: [teacher(1, [1, 3]), teacher(2, [1]), teacher(3, [1])],
    periods: PERIODS,
    requests: [1, 2, 3].map((i) => req(i, 11)),
    closedDates: [],
    demands: [demand(1, 2, 11), demand(3, 1, 11)],
  });
  const science = r.placements.find((p) => p.subjectId === 3);
  check("理科が埋まる", science?.teacherId, 1);
  check("英語も2人埋まる", r.placements.filter((p) => p.subjectId === 1).length, 2);
  check("未充足なし", r.unfilled.length, 0);
}

// ============================================================
console.log("\n[サマリ] 集計が合う");

{
  const r = generate({
    teachers: [teacher(1, [1]), teacher(2, [1])],
    periods: PERIODS,
    requests: [req(1), req(2)],
    closedDates: [],
    demands: [demand(1, 3)],
  });
  check("必要合計", r.summary.requiredTotal, 3);
  check("割当合計", r.summary.placedTotal, 2);
  check("充足率", Number(r.summary.fillRate.toFixed(3)), 0.667);
  check("科目別の内訳", r.summary.bySubject, [{ subjectId: 1, required: 3, placed: 2 }]);
}

{
  // 需要が無ければ充足率は100%（0割りにしない）
  const r = generate({
    teachers: [teacher(1, [1])],
    periods: PERIODS,
    requests: [req(1)],
    closedDates: [],
    demands: [],
  });
  check("需要0なら充足率1", r.summary.fillRate, 1);
  check("偏り0", r.summary.spread, 0);
}

// ============================================================
console.log("\n[AC-11] 講師50名・1か月ぶんで3秒以内");

{
  const dates = datesBetween("2026-09-01", "2026-09-30");
  // 9:00 から 50分・間10分で6コマ（講習期間を模したもの）
  const periods: PeriodLite[] = [0, 1, 2, 3, 4, 5].map((o) => ({
    id: 100 + o,
    order: o,
    startTime: `${String(9 + o).padStart(2, "0")}:00`,
    endTime: `${String(9 + o).padStart(2, "0")}:50`,
  }));
  const subjects = [1, 2, 3, 4, 5];

  const teachers = Array.from({ length: 50 }, (_, i) =>
    // 1人あたり2科目。担当がばらけるように配る。
    teacher(i + 1, [subjects[i % 5], subjects[(i + 2) % 5]]),
  );

  const requests: RequestRow[] = [];
  for (const t of teachers) {
    for (const d of dates) {
      for (const p of periods) {
        // 7割くらい出られる。決定的に散らす。
        if ((t.id * 7 + d.charCodeAt(9) * 3 + p.order) % 10 < 7) {
          requests.push({ teacherId: t.id, date: d, periodId: p.id, status: SHIFT.OK });
        }
      }
    }
  }

  const demands: DemandRow[] = [];
  for (const d of dates) {
    for (const p of periods) {
      for (const s of subjects) {
        demands.push({
          date: d,
          periodId: p.id,
          subjectId: s,
          format: LESSON_STYLE.INDIV_2,
          required: 1,
        });
      }
    }
  }

  const r = generate({ teachers, periods, requests, closedDates: [], demands });

  console.log(
    `       規模: 講師${teachers.length}名・${dates.length}日・${periods.length}コマ・${subjects.length}科目`,
  );
  console.log(
    `       スロット${demands.length}件 / 希望${requests.length}件 → 割当${r.placements.length}件`,
  );
  console.log(`       充足率 ${(r.summary.fillRate * 100).toFixed(1)}% / 偏り ${r.summary.spread}`);
  checkTrue(`3秒以内（実際 ${r.elapsedMs}ms）`, r.elapsedMs < 3000);

  // 割当コマ数の差だけを見ると「そもそも希望を多く出した講師が多く入って当然」なので、
  // 公平性は充足率（出られると答えたうち実際に入った割合）のばらつきで測る。
  // ここが揃っていれば、たくさん希望を出した人が損も得もしていない。
  const rates = r.loads.filter((l) => l.available > 0).map((l) => l.fillRate!);
  const rateSpread = Math.max(...rates) - Math.min(...rates);
  console.log(
    `       充足率のばらつき ${(rateSpread * 100).toFixed(1)}ポイント` +
      `（最小 ${(Math.min(...rates) * 100).toFixed(1)}% / 最大 ${(Math.max(...rates) * 100).toFixed(1)}%）`,
  );
  checkTrue(
    `充足率のばらつきが10ポイント以内（実際 ${(rateSpread * 100).toFixed(1)}）`,
    rateSpread <= 0.1,
  );

  // 大きい入力でもハード制約が破れていないこと
  const overDay = r.loads.some((l) => {
    const byDay = new Map<string, number>();
    for (const p of r.placements.filter((x) => x.teacherId === l.teacherId)) {
      byDay.set(p.date, (byDay.get(p.date) ?? 0) + 1);
    }
    return [...byDay.values()].some((n) => n > RULE.maxPerDay);
  });
  check("1日の上限を破っていない", overDay, false);

  const seen = new Set<string>();
  let doubled = false;
  for (const p of r.placements) {
    const k = `${p.teacherId}:${p.date}:${p.periodId}`;
    if (seen.has(k)) doubled = true;
    seen.add(k);
  }
  check("同じコマの二重割当なし", doubled, false);
}

// ============================================================
console.log("\n[重み] 既定値が要件どおり");

{
  check("公平性", DEFAULT_WEIGHTS.fair, 1.0);
  check("科目適性", DEFAULT_WEIGHTS.subject, 0.5);
  check("希望", DEFAULT_WEIGHTS.prefer, 0.4);
  check("週の下限", DEFAULT_WEIGHTS.minWeek, 0.6);
  check("連続性", DEFAULT_WEIGHTS.continuity, 0.25);
  check("負荷", DEFAULT_WEIGHTS.load, 0.3);
  check("希少科目", DEFAULT_WEIGHTS.scarce, 0.35);
}

console.log(failed === 0 ? "\n✅ すべて期待どおり\n" : `\n❌ ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
