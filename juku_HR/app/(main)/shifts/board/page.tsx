import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cycleAssignment } from "../actions";
import { loadSummary, spread } from "@/lib/shifts";
import { termKindOfDate } from "@/lib/terms";
import { eventsBetween, isClosed } from "@/lib/events";
import {
  EMPLOYMENT_LABEL,
  GRADE_BAND_LABEL,
  GRADE_BAND_ORDER,
  SHIFT,
  SHIFT_MARK,
  TERM_KIND_LABEL,
  todayISO,
} from "@/lib/constants";
import { periodShortLabeler } from "@/lib/periods";
import {
  WEEKDAYS,
  dayOfMonth,
  dayOfWeek,
  shiftDays,
  weekDays,
  weekStart,
  withinTerm,
} from "@/lib/dates";

/**
 * 列の左に引く線。日の変わり目は濃く、学年帯の変わり目は薄く。
 * 1日5列（小2＋中3）が横に並ぶと、どこで日が変わるのか分からなくなる。
 */
function edge(dayFirst: boolean, bandFirst: boolean): string {
  if (dayFirst) return "border-l-2 border-l-slate-300";
  if (bandFirst) return "border-l border-l-slate-200";
  return "";
}

export const metadata = { title: "シフト調整＆確定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; subject?: string; band?: string }>;
}) {
  const sp = await searchParams;
  const anchor =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayISO();
  const days = weekDays(anchor);
  const from = days[0];
  const to = days[6];

  const [teachers, allPeriods, terms, requests, assignments, rows, subjects, links, demands] =
    await Promise.all([
      prisma.teacher.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
      prisma.period.findMany({ orderBy: [{ startTime: "asc" }, { id: "asc" }] }),
      prisma.term.findMany({ orderBy: { startDate: "asc" } }),
      prisma.shiftRequest.findMany({ where: { date: { gte: from, lte: to } } }),
      prisma.shiftAssignment.findMany({ where: { date: { gte: from, lte: to } } }),
      loadSummary(from, to),
      prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
      prisma.teacherSubject.findMany(),
      prisma.shiftDemand.findMany({ where: { date: { gte: from, lte: to } } }),
    ]);

  // 割当に科目が必要になったので、盤面は科目を1つ選んだビューにする。
  // 空きマスを押したときに「どの科目で入れるのか」を決められないため。
  const picked =
    subjects.find((s) => String(s.id) === sp.subject) ?? subjects[0] ?? null;

  // 塾の予定。休校日は割当できないので、盤面でも見えるようにする。
  const events = await eventsBetween(from, to);
  // 休校が後から決まった場合、確定が残っていることがある。外す必要があるので警告する。
  const closedAssigned = assignments.filter((a) => isClosed(a.date, events)).length;

  // コマは期タイプごとに違う（レギュラーは夕方、講習は朝から）。
  // 1週間の中でレギュラーと講習が混ざることがあるので、日ごとにコマを引く。
  //
  // 学年帯を分けている塾では、1日のコマ数が「小2＋中3」で5つになる。
  // 7日ぶん並べると35列になって横に長いので、学年帯で絞れるようにしてある。
  const weekBands = GRADE_BAND_ORDER.filter((b) =>
    days.some((d) =>
      allPeriods.some(
        (p) => p.termKind === termKindOfDate(d, terms) && p.gradeBand === b,
      ),
    ),
  );
  const band = weekBands.includes(sp.band ?? "") ? sp.band! : null;

  const periodsOf = (date: string) => {
    const kind = termKindOfDate(date, terms);
    return allPeriods.filter(
      (p) => p.termKind === kind && (band === null || p.gradeBand === band),
    );
  };

  /**
   * 列。日の区切りと、学年帯の区切りに線を引くための印を持たせる。
   * コマの並び順（order）は学年帯ごとに0から振り直されるので、
   * 「order が0なら日の先頭」という見分け方はもう使えない。
   */
  const columns = days.flatMap((d) => {
    const list = periodsOf(d);
    return list.map((p, i) => ({
      date: d,
      period: p,
      dayFirst: i === 0,
      bandFirst: i > 0 && list[i - 1].gradeBand !== p.gradeBand,
    }));
  });

  // 帯が混ざるときだけ「小1」「中1」と出す。
  // 1つの帯しか無い塾や、帯で絞り込んでいるときは今までどおり数字だけ。
  const shortLabel = periodShortLabeler(columns.map((c) => c.period));

  const reqOf = (teacherId: number, date: string, periodId: number) =>
    requests.find(
      (r) => r.teacherId === teacherId && r.date === date && r.periodId === periodId,
    );
  const assignOf = (teacherId: number, date: string, periodId: number) =>
    assignments.find(
      (a) => a.teacherId === teacherId && a.date === date && a.periodId === periodId,
    );

  const subjectName = (id: number | null) =>
    id === null ? "" : (subjects.find((s) => s.id === id)?.name ?? "?");

  /** その講師がその科目を担当できるか。できない人のマスは押しても入らない（H12）。 */
  const canTeach = (teacherId: number, subjectId: number) =>
    links.some((l) => l.teacherId === teacherId && l.subjectId === subjectId);

  /** 選んでいる科目の、そのコマの 必要人数 / 埋まった数 */
  const fillOf = (date: string, periodId: number) => {
    if (!picked) return null;
    const need = demands
      .filter((d) => d.date === date && d.periodId === periodId && d.subjectId === picked.id)
      .reduce((s, d) => s + d.required, 0);
    if (need === 0) return null;
    const got = assignments.filter(
      (a) => a.date === date && a.periodId === periodId && a.subjectId === picked.id,
    ).length;
    return { need, got };
  };

  // 週送りや科目を切り替えても、絞り込みは持ち回る
  const qs = (o: Record<string, string | number | null>) => {
    const base: Record<string, string> = {
      week: from,
      subject: String(picked?.id ?? ""),
    };
    if (band) base.band = band;
    for (const [k, v] of Object.entries(o)) {
      if (v === null) delete base[k];
      else base[k] = String(v);
    }
    return new URLSearchParams(base).toString();
  };

  const gap = spread(rows);
  const maxAssigned = Math.max(1, ...rows.map((r) => r.assigned));
  const totalConflicts = rows.reduce((s, r) => s + r.conflicts, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">調整＆確定</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            押すたびに 未割当 → 割当 → 固定 → 未割当 と変わります。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/shifts/board?${qs({ week: shiftDays(from, -7) })}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            ← 前週
          </Link>
          <Link
            href={`/shifts/board?${qs({ week: weekStart(todayISO()) })}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            今週
          </Link>
          <Link
            href={`/shifts/board?${qs({ week: shiftDays(from, 7) })}`}
            className="px-2.5 py-1.5 text-sm border border-slate-200 bg-white rounded hover:bg-slate-50"
          >
            翌週 →
          </Link>
        </div>
      </div>

      {/* 科目の切り替え。盤面は選んだ1科目のビューになる。 */}
      {subjects.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          科目が登録されていません。先に科目を登録してください。
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">科目</span>
          {subjects.map((s) => (
            <Link
              key={s.id}
              href={`/shifts/board?${qs({ subject: s.id })}`}
              className={`px-2.5 py-1 text-sm rounded ${
                picked?.id === s.id
                  ? "bg-indigo-600 text-white font-medium"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {/*
        学年帯の絞り込み。小2＋中3で1日5コマある塾だと、1週間で35列になる。
        「今日は中学生ぶんだけ見たい」ときに列を減らせるようにしてある。
        帯を1つしか使っていない塾では出ない。
      */}
      {weekBands.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">学年</span>
          <Link
            href={`/shifts/board?${qs({ band: null })}`}
            className={`px-2.5 py-1 text-sm rounded ${
              band === null
                ? "bg-slate-900 text-white font-medium"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            すべて
          </Link>
          {weekBands.map((b) => (
            <Link
              key={b}
              href={`/shifts/board?${qs({ band: b })}`}
              className={`px-2.5 py-1 text-sm rounded ${
                band === b
                  ? "bg-slate-900 text-white font-medium"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {GRADE_BAND_LABEL[b]}
            </Link>
          ))}
        </div>
      )}

      {totalConflicts > 0 && (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          「出られない」と回答されているコマに {totalConflicts} 件の確定が入っています。
          下の表の赤いセルを確認してください。
        </p>
      )}

      {closedAssigned > 0 && (
        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          休校日に確定シフトが {closedAssigned} 件残っています。赤いセルを押して外してください。
        </p>
      )}

      {/* 盤面 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-500 w-32"
              >
                講師
              </th>
              {days.map((d) => {
                const term = terms.find((t) => withinTerm(d, t));
                const dow = dayOfWeek(d);
                const count = periodsOf(d).length;
                if (count === 0) return null;
                const closed = isClosed(d, events);
                return (
                  <th
                    key={d}
                    colSpan={count}
                    className={`border-b border-l border-slate-200 px-1 py-1 text-xs font-medium ${
                      dow === 0
                        ? "text-rose-500"
                        : dow === 6
                          ? "text-sky-500"
                          : "text-slate-600"
                    } ${closed ? "bg-rose-50" : d === todayISO() ? "bg-indigo-50" : ""}`}
                  >
                    {dayOfMonth(d)}({WEEKDAYS[dow]})
                    {closed ? (
                      <span className="ml-1 text-[9px] bg-rose-500 text-white rounded px-1">
                        休
                      </span>
                    ) : (
                      term &&
                      term.kind !== "REGULAR" && (
                        <span className="ml-1 text-[9px] text-amber-700">
                          {TERM_KIND_LABEL[term.kind]}
                        </span>
                      )
                    )}
                  </th>
                );
              })}
              <th
                rowSpan={3}
                className="border-b border-l-2 border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 w-24"
              >
                今週の割当
              </th>
            </tr>
            <tr>
              {columns.map(({ date: d, period: p, dayFirst, bandFirst }) => (
                <th
                  key={`${d}-${p.id}`}
                  title={`${GRADE_BAND_LABEL[p.gradeBand]} ${p.name} ${p.startTime}-${p.endTime}`}
                  className={`border-b border-slate-200 px-0 py-0.5 text-[10px] font-normal text-slate-400 w-8 ${edge(dayFirst, bandFirst)} ${
                    d === todayISO() ? "bg-indigo-50" : ""
                  }`}
                >
                  {shortLabel(p)}
                </th>
              ))}
            </tr>
            {/* 選んでいる科目の充足状況。足りないコマが一目で分かる。 */}
            <tr>
              {columns.map(({ date: d, period: p, dayFirst, bandFirst }) => {
                const f = fillOf(d, p.id);
                return (
                  <th
                    key={`f-${d}-${p.id}`}
                    className={`border-b border-slate-200 px-0 py-0.5 text-[9px] font-normal w-8 ${edge(dayFirst, bandFirst)} ${
                      f === null
                        ? "text-slate-200"
                        : f.got >= f.need
                          ? "text-emerald-600"
                          : "text-rose-600 font-bold"
                    }`}
                    title={
                      f === null
                        ? `${picked?.name ?? ""}の必要人数は設定されていません`
                        : `${picked?.name ?? ""} ${f.got}/${f.need}人`
                    }
                  >
                    {f === null ? "—" : `${f.got}/${f.need}`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => {
              const row = rows.find((r) => r.teacherId === t.id);
              const teaches = picked ? canTeach(t.id, picked.id) : false;
              return (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <th className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-3 py-1 text-left font-normal">
                    <div
                      className={`text-sm truncate ${
                        teaches ? "text-slate-900" : "text-slate-300"
                      }`}
                    >
                      {t.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {EMPLOYMENT_LABEL[t.employment]}
                    </div>
                  </th>

                  {columns.map(({ date: d, period: p, dayFirst, bandFirst }) => {
                    const r = reqOf(t.id, d, p.id);
                    const a = assignOf(t.id, d, p.id);
                    const closed = isClosed(d, events);

                    // 選んでいる科目で入っているか、別の科目で入っているか
                    const mine = a && (a.subjectId === null || a.subjectId === picked?.id);
                    const other = a && !mine;
                    const conflict = !!a && r?.status === SHIFT.NG;

                    // 休校日は割当できない。ただし確定が残っていれば外せるようにする。
                    if (closed && !a) {
                      return (
                        <td
                          key={`${d}-${p.id}`}
                          className={`border-b border-slate-100 p-0 text-center ${edge(dayFirst, bandFirst)}`}
                        >
                          <div className="w-8 h-7 bg-rose-50/70" title={`${d} は休校日です`} />
                        </td>
                      );
                    }

                    // 別の科目で入っているマスは押しても変わらない（H13）
                    if (other) {
                      return (
                        <td
                          key={`${d}-${p.id}`}
                          className={`border-b border-slate-100 p-0 text-center ${edge(dayFirst, bandFirst)}`}
                        >
                          <div
                            className="w-8 h-7 bg-slate-100 text-slate-400 text-[10px] leading-7"
                            title={`${t.name} はこのコマに ${subjectName(a!.subjectId)} で入っています（同じコマで2科目は持てません）`}
                          >
                            {subjectName(a!.subjectId).slice(0, 1)}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={`${d}-${p.id}`}
                        className={`border-b border-slate-100 p-0 text-center ${edge(dayFirst, bandFirst)}`}
                      >
                        <form action={cycleAssignment}>
                          <input type="hidden" name="teacherId" value={t.id} />
                          <input type="hidden" name="date" value={d} />
                          <input type="hidden" name="periodId" value={p.id} />
                          <input type="hidden" name="subjectId" value={picked?.id ?? 0} />
                          <button
                            type="submit"
                            disabled={!picked || (!a && !teaches)}
                            title={cellTitle(
                              t.name,
                              d,
                              p.name,
                              picked?.name ?? "",
                              r?.status,
                              a ?? null,
                              teaches,
                            )}
                            className={`w-8 h-7 text-[11px] leading-none ${cellClass(
                              r?.status,
                              !!a,
                              a?.locked ?? false,
                              conflict || (closed && !!a),
                              teaches,
                            )}`}
                          >
                            {a ? (a.locked ? "🔒" : "●") : r ? SHIFT_MARK[r.status] : ""}
                          </button>
                        </form>
                      </td>
                    );
                  })}

                  <td className="border-b border-slate-100 border-l-2 border-l-slate-300 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums text-slate-900 w-4 text-right">
                        {row?.assigned ?? 0}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{
                            width: `${((row?.assigned ?? 0) / maxAssigned) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums w-8">
                        /{row?.available ?? 0}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          <Legend cls="bg-indigo-600 text-white">●</Legend> 割当
        </span>
        <span>
          <Legend cls="bg-emerald-600 text-white">🔒</Legend> 固定（作り直しても動かない）
        </span>
        <span>
          <Legend cls="bg-indigo-50 text-indigo-600">◎</Legend> 入りたい
        </span>
        <span>
          <Legend cls="bg-white text-slate-500 border border-slate-200">○</Legend> 出られる
        </span>
        <span>
          <Legend cls="bg-rose-50 text-rose-400">×</Legend> 出られない
        </span>
        <span>
          <Legend cls="bg-slate-100 text-slate-400">数</Legend> 別の科目で入っている
        </span>
        <span className="text-slate-400">
          薄い行はその科目を担当できない講師
        </span>
      </div>

      {/* 偏りの確認 */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">今週の偏り</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            希望を出した講師の中で、割当コマ数がいちばん多い人と少ない人の差は{" "}
            <span
              className={`font-bold ${gap >= 4 ? "text-rose-600" : gap >= 2 ? "text-amber-600" : "text-emerald-600"}`}
            >
              {gap}コマ
            </span>
            です。
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400">
              <th className="text-left font-medium px-4 py-1.5">講師</th>
              <th className="text-right font-medium px-2 py-1.5 w-20">出られる</th>
              <th className="text-right font-medium px-2 py-1.5 w-20">確定</th>
              <th className="text-right font-medium px-4 py-1.5 w-24">充足率</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => b.assigned - a.assigned)
              .map((r) => (
                <tr key={r.teacherId} className="border-t border-slate-100">
                  <td className="px-4 py-1.5 text-slate-900">
                    {r.name}
                    {r.conflicts > 0 && (
                      <span className="ml-2 text-[10px] text-rose-700 bg-rose-50 rounded px-1">
                        NGに{r.conflicts}件
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                    {r.available}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                    {r.assigned}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-slate-500">
                    {r.fillRate === null ? "—" : `${Math.round(r.fillRate * 100)}%`}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          充足率は「出られると答えたコマのうち、実際に入ったコマの割合」。
          特定の講師だけ極端に高い／低い状態が続いていないかの目安になります。
        </p>
      </section>

      {terms.length > 0 && (
        <p className="text-[11px] text-slate-400">
          期:{" "}
          {terms
            .map((t) => `${t.name}（${TERM_KIND_LABEL[t.kind]}）${t.startDate}〜${t.endDate}`)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}

function cellClass(
  status: string | undefined,
  assigned: boolean,
  locked: boolean,
  conflict: boolean,
  teaches: boolean,
): string {
  if (conflict) return "bg-rose-500 text-white font-bold ring-1 ring-inset ring-rose-700";
  if (locked) return "bg-emerald-600 text-white font-bold hover:bg-emerald-700";
  if (assigned) return "bg-indigo-600 text-white font-bold hover:bg-indigo-700";
  // その科目を担当できない講師のマスは押せない
  if (!teaches) return "bg-slate-50/50 text-slate-200 cursor-not-allowed";
  if (status === SHIFT.PREFER)
    return "bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100";
  if (status === SHIFT.OK) return "bg-white text-slate-500 hover:bg-slate-100";
  if (status === SHIFT.NG) return "bg-rose-50 text-rose-400 hover:bg-rose-100";
  return "bg-slate-50 text-slate-300 hover:bg-slate-100";
}

function cellTitle(
  name: string,
  date: string,
  period: string,
  subject: string,
  status: string | undefined,
  assignment: { locked: boolean; source: string; score: number | null } | null,
  teaches: boolean,
): string {
  const want =
    status === SHIFT.PREFER
      ? "できれば入りたい"
      : status === SHIFT.OK
        ? "出られる"
        : status === SHIFT.NG
          ? "出られない"
          : "未回答";

  const parts = [`${name} ${date} ${period}（${subject}）`, `希望: ${want}`];

  if (!teaches && !assignment) {
    parts.push(`${name} は ${subject} を担当できません`);
    return parts.join("／");
  }

  if (!assignment) {
    parts.push("未割当。押すと割り当てます");
    return parts.join("／");
  }

  parts.push(assignment.locked ? "固定（作り直しても動かない）" : "割当済み");
  parts.push(assignment.source === "AUTO" ? "自動作成" : "手修正");
  // なぜこの人が選ばれたかの根拠。評価値が高いほど優先された。
  if (assignment.score !== null) parts.push(`評価値 ${assignment.score}`);
  parts.push(assignment.locked ? "押すと外します" : "押すと固定します");

  return parts.join("／");
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-sm align-middle text-[10px] ${cls}`}
    >
      {children}
    </span>
  );
}
