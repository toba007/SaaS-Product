/**
 * 実データで開講時間割を作ってみる。
 *   npm run demo:timetable            決定的な配置だけ（AIを使わない）
 *   npm run demo:timetable -- --ai    Ollama に提案させて、検証して、埋め直す
 *
 * AI の提案がどれだけ使えるかを、決定的な配置と並べて確かめるための道具。
 * 画面を作る前に、そもそも実用になるのかをここで見る。
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { OllamaClient, checkOllama } from "../lib/ai/local-ollama";
import { LlmError } from "../lib/ai/client";
import {
  buildPrompt,
  proposeTimetable,
  proposeWithoutLlm,
  type ProposeResult,
} from "../lib/ai/propose-timetable";
import {
  buildAvailability,
  checkPlacements,
  foldWeekly,
  reliableTeachers,
  slotKey,
  type Availability,
  type CheckInput,
  type Target,
} from "../lib/timetable";
import { getSetting } from "../lib/settings";
import { excludeClosed } from "../lib/events";
import { datesBetween, WEEKDAYS } from "../lib/dates";
import { LESSON_STYLE, TERM_KIND, bandOfGrade, indivSizeOf } from "../lib/constants";
import { periodsForGrade } from "../lib/periods";
import { pseudonym } from "../lib/ai/anonymize";

const useAi = process.argv.includes("--ai");
/** 一度に頼む対象の数。--chunk 4 のように渡す。0 ならまとめて1回。 */
const chunkSize = Number(
  process.argv[process.argv.indexOf("--chunk") + 1] ?? 0,
) || 0;

async function main() {
  // 希望が集まっている学期を選ぶ。希望が1件も無い期で回しても、
  // 「置ける枠が無い」としか出ず、配置の良し悪しが分からない。
  const terms = await prisma.term.findFirst({
    where: { kind: TERM_KIND.REGULAR },
    orderBy: { startDate: "asc" },
  });
  if (!terms) throw new Error("レギュラーの期がありません。npm run seed を実行してください。");

  const candidates = await prisma.term.findMany({
    where: { kind: TERM_KIND.REGULAR },
    orderBy: { startDate: "asc" },
  });
  let term = candidates[0];
  let best = -1;
  for (const c of candidates) {
    const n = await prisma.shiftRequest.count({
      where: { date: { gte: c.startDate, lte: c.endDate } },
    });
    if (n > best) {
      best = n;
      term = c;
    }
  }
  if (best === 0) {
    console.log("※ どの学期にもシフト希望がありません。npm run seed を実行してください。");
  }

  const [periods, classGroups, sessions, enrollments, links, requests, teacherSubjects, setting] =
    await Promise.all([
      prisma.period.findMany({
        where: { termKind: TERM_KIND.REGULAR },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
      }),
      prisma.classGroup.findMany(),
      prisma.classSession.findMany(),
      prisma.classEnrollment.findMany(),
      prisma.studentSubject.findMany({
        where: { active: true },
        include: { student: { select: { id: true, grade: true } } },
      }),
      prisma.shiftRequest.findMany({
        where: { date: { gte: term.startDate, lte: term.endDate } },
      }),
      prisma.teacherSubject.findMany(),
      getSetting(),
    ]);

  // 休校日は除く。分母に入れると「毎回出られる」判定がずれる。
  const days = await excludeClosed(datesBetween(term.startDate, term.endDate));

  // ---- 対象を組み立てる ----
  const targets: Target[] = [];

  for (const c of classGroups) {
    if (c.toDate < term.startDate || c.fromDate > term.endDate) continue;
    const slots = sessions.filter((s) => s.classGroupId === c.id).length;
    targets.push({
      key: `class:${c.id}`,
      kind: "CLASS",
      refId: c.id,
      label: c.name,
      subjectId: c.subjectId,
      gradeBand: bandOfGrade(c.grade),
      studentIds: enrollments.filter((e) => e.classGroupId === c.id).map((e) => e.studentId),
      // 時間割が未登録なら週1コマとして置いてみる
      slots: slots > 0 ? slots : 1,
    });
  }

  for (const l of links) {
    if (l.format === LESSON_STYLE.GROUP) continue;
    if (l.slotsPerWeek <= 0) continue;
    targets.push({
      key: `indiv:${l.id}`,
      kind: "INDIV",
      refId: l.id,
      label: `${pseudonym(l.studentId)}の科目${l.subjectId}`,
      subjectId: l.subjectId,
      gradeBand: bandOfGrade(l.student.grade),
      studentIds: [l.studentId],
      slots: l.slotsPerWeek,
      solo: indivSizeOf(l.format) === 1,
    });
  }

  // ---- 講師がいつ来られるか ----
  const weekly = foldWeekly(
    requests.map((r) => ({
      teacherId: r.teacherId,
      date: r.date,
      periodId: r.periodId,
      status: r.status,
    })),
    days,
    periods.map((p) => p.id),
  );

  const canTeach = (teacherId: number, subjectId: number) =>
    teacherSubjects.some((x) => x.teacherId === teacherId && x.subjectId === subjectId);

  // 開講する曜日。日曜は休みとして外す。
  const openDows = [1, 2, 3, 4, 5, 6];

  const availability = new Map<string, Availability>();
  for (const t of targets) {
    // その学年帯が使えるコマだけを候補にする
    const usable = periodsForGrade(
      periods,
      t.gradeBand === "ELEM" ? "小5" : t.gradeBand === "HIGH" ? "高1" : "中1",
      TERM_KIND.REGULAR,
    );
    const slots = openDows.flatMap((d) => usable.map((p) => ({ dayOfWeek: d, periodId: p.id })));
    availability.set(t.key, buildAvailability(weekly, slots, t.subjectId, canTeach));
  }

  // 枠ごとに「科目を問わず出られる講師」。1人は同時に1か所にしかいられないので、
  // 科目ごとの人数を足し上げた数がこれを超えていないかを見るために渡す。
  const slotTeachers = new Map<string, Set<number>>();
  for (const d of openDows) {
    for (const p of periods) {
      const slot = { dayOfWeek: d, periodId: p.id };
      slotTeachers.set(slotKey(slot), reliableTeachers(weekly, slot));
    }
  }

  const input: CheckInput = {
    targets,
    periods,
    availability,
    slotTeachers,
    maxGroupRooms: setting.maxGroupRooms,
    maxIndivRooms: setting.maxIndivRooms,
    indivMaxStudents: setting.indivMaxStudents,
  };

  console.log(`期: ${term.name}（${term.startDate} 〜 ${term.endDate}／開講${days.length}日）`);
  console.log(
    `対象: ${targets.length}件（集団${targets.filter((t) => t.kind === "CLASS").length} / 個別${
      targets.filter((t) => t.kind === "INDIV").length
    }）`,
  );
  console.log(
    `教室: 集団${setting.maxGroupRooms}室 / 個別${setting.maxIndivRooms}室 / 個別は1人${setting.indivMaxStudents}人まで`,
  );

  // 置ける枠がまったく無い対象は、先に知らせる
  const nowhere = targets.filter(
    (t) => ![...(availability.get(t.key)?.values() ?? [])].some((s) => s.size > 0),
  );
  if (nowhere.length > 0) {
    console.log(
      `\n置ける枠が無い対象: ${nowhere.length}件（担当できて毎回出られる講師がいない）`,
    );
    for (const t of nowhere.slice(0, 5)) console.log(`  - ${t.label}`);
  }

  // ---- 配置する ----
  let result: ProposeResult;
  if (useAi) {
    const health = await checkOllama();
    console.log(`\nOllama: ${health.message}`);
    if (!health.ok) {
      console.log("→ AI を使わない配置に切り替えます");
      result = proposeWithoutLlm({ check: input });
    } else {
      try {
        const prompt = buildPrompt({ check: input, pseudonym });
        console.log(
          `入力の大きさ: ${prompt.text.length}文字 / 対象${targets.length}件 / 枠${prompt.slotOf.size}個` +
            (chunkSize > 0 ? ` / ${chunkSize}件ずつに分けて送る` : ""),
        );
        console.log("提案を待っています（CPU 実行だと数分かかります）…");
        // 出力2トークン/秒ほどなので、20件ぶんだと10分近くかかる。まとめて流す処理なので待つ。
        result = await proposeTimetable(new OllamaClient(undefined, undefined, 900_000), {
          check: input,
          chunkSize,
          note: "小学生はなるべく早い時間に寄せてください。同じ曜日に偏らせないでください。",
          pseudonym,
        });
      } catch (e) {
        console.log(
          `→ 提案に失敗したので、AI を使わない配置に切り替えます: ${
            e instanceof LlmError ? e.message : String(e)
          }`,
        );
        result = proposeWithoutLlm({ check: input });
      }
    }
  } else {
    result = proposeWithoutLlm({ check: input });
  }

  // ---- 結果 ----
  const violations = checkPlacements(result.placements, input);
  const real = violations.filter((v) => v.code !== "T5_SLOT_COUNT");

  console.log(`\n---- 結果（${result.model}${result.elapsedMs ? ` / ${result.elapsedMs}ms` : ""}）----`);
  console.log(`配置: ${result.placements.length}件`);
  console.log(`置けなかった対象: ${result.unplaced.length}件`);
  console.log(
    `  うち AI が決めた: ${result.fromAi}件 / 機械が埋めた: ${result.fromFallback}件`,
  );
  console.log(`AI の提案を落とした数: ${result.rejected.length}件`);

  console.log(`\nハード制約の違反: ${real.length}件${real.length === 0 ? "（問題なし）" : ""}`);
  for (const v of real.slice(0, 8)) console.log(`  [${v.code}] ${v.message}`);

  const shortage = violations.filter((v) => v.code === "T5_SLOT_COUNT");
  if (shortage.length > 0) {
    console.log(`\nコマ数が足りない対象: ${shortage.length}件`);
    for (const v of shortage.slice(0, 5)) console.log(`  ${v.message}`);
  }

  if (result.rejected.length > 0) {
    console.log("\n---- 落とした提案（AI が制約を外したもの）----");
    for (const r of result.rejected.slice(0, 8)) {
      console.log(
        `  ${r.placement.targetKey} → ${WEEKDAYS[r.placement.dayOfWeek]}曜/コマ${r.placement.periodId}` +
          `：${r.violations.map((v) => v.code).join(",")}`,
      );
    }
  }

  console.log("\n---- 時間割（先頭20件）----");
  const byName = new Map(targets.map((t) => [t.key, t.label]));
  const periodName = new Map(periods.map((p) => [p.id, `${p.gradeBand === "ELEM" ? "小" : "中"}${p.name}`]));
  for (const p of result.placements.slice(0, 20)) {
    const why = result.reasons.get(`${p.targetKey}:${slotKey(p)}`);
    console.log(
      `  ${WEEKDAYS[p.dayOfWeek]}曜 ${periodName.get(p.periodId)}  ${byName.get(p.targetKey)}` +
        (why ? `  ← ${why}` : ""),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
