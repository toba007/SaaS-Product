import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { AutoRefresh } from "./AutoRefresh";
import { Grid, groupColumnLabel, indivColumnLabel } from "./Grid";
import { addPlacement, applyRun, startRun } from "./actions";
import { RUN_MODE, RUN_STATUS, buildTimetableInput } from "@/lib/timetable-run";
import { checkPlacements, type Placement } from "@/lib/timetable";
import { checkGroups, type Groupable } from "@/lib/indiv-groups";
import { TERM_KIND } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/dates";
import { periodLabeler, type PeriodLite } from "@/lib/periods";
import {
  buildGroupGrid,
  buildIndivGrid,
  type ViewItem,
} from "@/lib/timetable-view";
import { getSetting } from "@/lib/settings";
import { outputTokensPerSec, projectOutputMs } from "@/lib/ai/client";
import { indivSizeOf, SUBJECT_STREAM } from "@/lib/constants";

export const metadata = { title: "開講時間割｜塾HR" };
export const dynamic = "force-dynamic";

/**
 * 開講時間割を組む画面。
 *
 * 「いつ開講するか」を決める工程。担当できる講師がいつ来られるかを見て
 * 決める作業を、機械（と AI）に手伝わせる。
 *
 * **出てくるのは案。** 人が見て手直しして、確定を押したときに初めて
 * クラスの時間割と個別の受講予定に書き込む。
 */
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; run?: string }>;
}) {
  const sp = await searchParams;

  const terms = await prisma.term.findMany({
    where: { kind: TERM_KIND.REGULAR },
    orderBy: { startDate: "asc" },
  });

  if (terms.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-900">開講時間割</h1>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          レギュラーの期が登録されていません。先に期を登録してください。
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const termId =
    terms.find((t) => String(t.id) === sp.term)?.id ??
    terms.find((t) => today >= t.startDate && today <= t.endDate)?.id ??
    terms[0].id;
  const term = terms.find((t) => t.id === termId)!;

  const runs = await prisma.timetableRun.findMany({
    where: { termId },
    orderBy: { startedAt: "desc" },
    take: 10,
    include: { _count: { select: { placements: true } } },
  });

  const run =
    runs.find((r) => String(r.id) === sp.run) ?? runs[0] ?? null;

  const periods: PeriodLite[] = await prisma.period.findMany({
    where: { termKind: TERM_KIND.REGULAR },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  const label = periodLabeler(periods);

  const qs = (o: Record<string, string | number>) =>
    new URLSearchParams({ term: String(termId), ...o } as Record<string, string>).toString();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">開講時間割</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          「中3英語Ⅰは毎週火曜2限」を決めます。担当できる講師がいつ来られるかから逆算します。
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">出てくるのは案です。</b>
          見て手直しして、確定を押したときに初めて{" "}
          <Link href="/classes" className="text-indigo-600 hover:underline">
            クラス編成
          </Link>{" "}
          と{" "}
          <Link href="/students/schedule" className="text-indigo-600 hover:underline">
            個別の受講予定
          </Link>{" "}
          に書き込まれます。
        </p>
        <p>
          <b className="text-slate-700">AI が外しても、守れない時間割は出ません。</b>
          提案は必ず制約の検証を通し、通らないものは落として機械の配置で埋めます。
        </p>
      </div>

      {/* 期の切り替え */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400 mr-1">期</span>
        {terms.map((t) => (
          <Link
            key={t.id}
            href={`/shifts/timetable?term=${t.id}`}
            className={`px-2.5 py-1 text-sm rounded ${
              t.id === termId
                ? "bg-slate-900 text-white font-medium"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.name}
          </Link>
        ))}
      </div>

      <StartForm termId={termId} />

      {runs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">過去の実行</span>
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/shifts/timetable?${qs({ run: r.id })}`}
              className={`px-2 py-1 text-[11px] rounded border ${
                run?.id === r.id
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {r.startedAt.toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              <span className="ml-1 opacity-70">
                {r.mode === RUN_MODE.AI ? "AI" : "機械"}
              </span>
              {r.appliedAt && <span className="ml-1">✓</span>}
            </Link>
          ))}
        </div>
      )}

      {run && (
        <RunView
          run={run}
          termId={termId}
          termName={term.name}
          periods={periods}
          label={label}
        />
      )}

      {!run && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-8 text-center">
          まだ組んでいません。上のボタンから始めてください。
        </p>
      )}
    </div>
  );
}

// ---------- 開始フォーム ----------

function StartForm({ termId }: { termId: number }) {
  return (
    <form
      action={startRun}
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <input type="hidden" name="termId" value={termId} />
      <div className="px-4 py-2.5 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900 text-sm">時間割を組む</h2>
      </div>

      <div className="px-4 py-3 space-y-3">
        <label className="block">
          <span className="text-xs text-slate-500">
            要望（AI に組ませるときだけ使います）
          </span>
          <textarea
            name="note"
            rows={2}
            maxLength={2000}
            placeholder="例：小学生はなるべく早い時間に寄せてください。同じ曜日に偏らせないでください。"
            className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <span className="block text-[10px] text-slate-400 mt-0.5">
            日本語でそのまま書いてください。重み付けの設定は要りません。
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="mode"
            value={RUN_MODE.GREEDY}
            className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
          >
            機械で組む（すぐ終わります）
          </button>
          <button
            type="submit"
            name="mode"
            value={RUN_MODE.AI}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            AI に組ませる（要望を反映）
          </button>
          <p className="text-[11px] text-slate-500 flex-1 min-w-60">
            <b className="text-slate-700">AI はこのPCで動かすと20分近くかかります。</b>
            押したあとページを閉じても実行は続きます。開き直せば結果が出ています。
          </p>
        </div>
      </div>
    </form>
  );
}

// ---------- 実行の結果 ----------

type RunRow = Awaited<
  ReturnType<
    typeof prisma.timetableRun.findMany<{
      include: { _count: { select: { placements: true } } };
    }>
  >
>[number];

async function RunView({
  run,
  termId,
  termName,
  periods,
  label,
}: {
  run: RunRow;
  termId: number;
  termName: string;
  periods: PeriodLite[];
  label: (p: PeriodLite) => string;
}) {
  if (run.status === RUN_STATUS.RUNNING) {
    return (
      <section className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-4">
        <p className="text-sm text-indigo-900 font-medium">
          組んでいます…{" "}
          <AutoRefresh startedAt={run.startedAt.toISOString()} />
        </p>
        <p className="text-xs text-indigo-800 mt-1">
          {run.mode === RUN_MODE.AI
            ? "AI に頼んでいます。このPCだと20分近くかかります。ページを閉じても構いません。"
            : "まもなく終わります。"}
        </p>
      </section>
    );
  }

  if (run.status === RUN_STATUS.FAILED) {
    return (
      <section className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-4">
        <p className="text-sm text-rose-900 font-medium">組めませんでした</p>
        <p className="text-xs text-rose-800 mt-1">{run.error || "理由が記録されていません"}</p>
      </section>
    );
  }

  // 終わっている。中身を出す前に、いまの配置をもう一度検証する。
  // 人が手直ししたあとも、守れているかを見せ続けるため。
  const [placements, { input }] = await Promise.all([
    prisma.timetablePlacement.findMany({
      where: { runId: run.id },
      orderBy: [{ dayOfWeek: "asc" }, { periodId: "asc" }, { id: "asc" }],
    }),
    buildTimetableInput(termId),
  ]);

  const asPlacements: Placement[] = placements.map((p) => ({
    targetKey: p.targetKey,
    dayOfWeek: p.dayOfWeek,
    periodId: p.periodId,
  }));
  const violations = checkPlacements(asPlacements, input);

  const hard = violations.filter((v) => v.code !== "T5_SLOT_COUNT");
  const shortage = violations.filter((v) => v.code === "T5_SLOT_COUNT");

  const unplaced: { label: string; reason: string; needed: number }[] = run.unplaced
    ? (JSON.parse(run.unplaced) as { label: string; reason: string; needed: number }[])
    : [];

  // ---- 画面に出す名前を実データから引く ----
  //
  // 記録に焼き付けてある label は仮名（生徒003）。**LLM に送るためのもの**で、
  // 管理者の画面には実名を出さないと誰の予定か分からない。
  const classIds = [...new Set(placements.filter((p) => p.kind === "CLASS").map((p) => p.refId))];
  const linkIds = [...new Set(placements.filter((p) => p.kind === "INDIV").map((p) => p.refId))];

  const [classGroups, links, subjects, setting] = await Promise.all([
    prisma.classGroup.findMany({ where: { id: { in: classIds } } }),
    prisma.studentSubject.findMany({
      where: { id: { in: linkIds } },
      include: { student: { select: { name: true, grade: true } } },
    }),
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
    getSetting(),
  ]);

  const classById = new Map(classGroups.map((c) => [c.id, c]));
  const linkById = new Map(links.map((l) => [l.id, l]));
  const subjectName = (id: number) =>
    subjects.find((s) => s.id === id)?.name ?? `科目${id}`;
  // 系統（文系／理系）。組を寄せる向きが決まる
  const streamOf = (id: number) =>
    subjects.find((s) => s.id === id)?.stream ?? SUBJECT_STREAM.OTHER;

  const items: ViewItem[] = placements.map((p) => {
    if (p.kind === "CLASS") {
      const c = classById.get(p.refId);
      return {
        id: p.id,
        targetKey: p.targetKey,
        kind: "CLASS" as const,
        subjectId: c?.subjectId ?? 0,
        name: c?.name ?? p.label,
        note: c ? subjectName(c.subjectId) : "",
        dayOfWeek: p.dayOfWeek,
        periodId: p.periodId,
        reason: p.reason,
        byHand: p.byHand,
      };
    }
    const l = linkById.get(p.refId);
    return {
      id: p.id,
      targetKey: p.targetKey,
      kind: "INDIV" as const,
      subjectId: l?.subjectId ?? 0,
      // 「中2 山田太郎（英）」の形。PDF の書き方に合わせる。
      name: l
        ? `${l.student.grade} ${l.student.name}（${subjectName(l.subjectId).slice(0, 1)}）`
        : p.label,
      note: "",
      dayOfWeek: p.dayOfWeek,
      periodId: p.periodId,
      reason: p.reason,
      byHand: p.byHand,
      // 誰と一緒に見るか。0 なら未定で、表示のときに機械が束ねる
      groupNo: p.groupNo,
      linkId: p.refId,
    };
  });

  // 1対1を希望している生徒は、他の生徒と同じ講師にまとめられない
  const soloKeys = new Set(
    links.filter((l) => indivSizeOf(l.format) === 1).map((l) => `indiv:${l.id}`),
  );

  // 組が成り立っているかを見る。**人が組み替えたあとに崩れていないか。**
  // 機械が作った組は必ず通るが、人は上限を超えて詰めることも、
  // 1対1の生徒を他の生徒と同じ組にすることもできてしまう。
  const nameOfLink = (linkId: number) => {
    const l = linkById.get(linkId);
    return l ? `${l.student.grade} ${l.student.name}` : `#${linkId}`;
  };
  const groupIssues: string[] = [];
  {
    const bySlot = new Map<string, Groupable[]>();
    for (const p of placements) {
      if (p.kind !== "INDIV") continue;
      const k = `${p.dayOfWeek}:${p.periodId}`;
      bySlot.set(k, [
        ...(bySlot.get(k) ?? []),
        {
          studentSubjectId: p.refId,
          subjectId: linkById.get(p.refId)?.subjectId ?? 0,
          solo: soloKeys.has(p.targetKey),
          groupNo: p.groupNo,
        },
      ]);
    }
    for (const [k, list] of bySlot) {
      const [d, pid] = k.split(":").map(Number);
      const period = periods.find((x) => x.id === pid);
      const where = `${WEEKDAYS[d]}曜${period ? label(period) : `コマ${pid}`}`;

      // その顔ぶれを1人で持てる講師がいるか。**人が組み替えたあとに崩れる。**
      // 講師が担当するのは得意な2科目ほどなので、科目を跨いで詰めると
      // 誰も持てない組み合わせが簡単にできてしまう。
      const coverable = (members: { studentSubjectId: number }[]) => {
        let common: Set<number> | null = null;
        for (const m of members) {
          const set = input.availability.get(`indiv:${m.studentSubjectId}`)?.get(k);
          if (!set || set.size === 0) return false;
          if (common === null) {
            common = new Set<number>(set);
          } else {
            const next = new Set<number>();
            for (const id of common) if (set.has(id)) next.add(id);
            common = next;
          }
          if (common.size === 0) return false;
        }
        return common !== null && common.size > 0;
      };

      for (const v of checkGroups(list, setting.indivMaxStudents, nameOfLink, coverable)) {
        groupIssues.push(`${where}：${v.message}`);
      }
    }
  }

  // 開講する曜日。日曜は休みとして外す。土曜は使っていなければ列に出さない。
  const usedDays = new Set(placements.map((p) => p.dayOfWeek));
  const days = [1, 2, 3, 4, 5, 6].filter((d) => d !== 6 || usedDays.has(6));

  const groupGrid = buildGroupGrid(items, periods, days, setting.maxGroupRooms);
  const indivGrid = buildIndivGrid(
    items,
    periods,
    days,
    setting.indivMaxStudents,
    soloKeys,
    subjectName,
    streamOf,
  );

  // 守れていない配置か、崩れた組が残っているあいだは確定させない
  const blocked = hard.length > 0 || groupIssues.length > 0;

  const targetKeys = [...new Set(placements.map((p) => p.targetKey))];
  const nameOfTarget = (key: string) =>
    items.find((i) => i.targetKey === key)?.name ?? key;

  return (
    <div className="space-y-4">
      {/* 要約 */}
      <section className="bg-white border border-slate-200 rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="text-slate-900 font-medium">
            {placements.length}コマの案
          </span>
          <span className="text-slate-500 text-xs">
            {run.mode === RUN_MODE.AI ? `AI（${run.model || "不明"}）` : "機械で配置"}
            {run.elapsedMs > 0 && ` ／ ${Math.round(run.elapsedMs / 1000)}秒`}
          </span>
          {run.mode === RUN_MODE.AI && (
            <span className="text-xs text-slate-500">
              AI が決めた <b className="text-slate-800">{run.fromAi}</b>件 ／ 機械が埋めた{" "}
              <b className="text-slate-800">{run.fromFallback}</b>件
              {run.rejected > 0 && ` ／ 落とした ${run.rejected}件`}
            </span>
          )}
          {run.appliedAt && (
            <span className="text-xs text-emerald-700 font-medium">反映済み</span>
          )}
        </div>
        {run.note && (
          <p className="mt-2 text-xs text-slate-500">
            要望：<span className="text-slate-700">{run.note}</span>
          </p>
        )}
        <Measured run={run} />
        {run.error && (
          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {run.error}
          </p>
        )}
      </section>

      {/* 守れていないもの */}
      {hard.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-900 space-y-1">
          <p className="font-medium">守れていない配置が {hard.length} 件あります</p>
          <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
            {hard.map((v, i) => (
              <li key={i}>
                [{v.code}] {v.message}
              </li>
            ))}
          </ul>
          <p className="text-xs">直すまで確定できません。</p>
        </div>
      )}

      {/* 組が崩れている */}
      {groupIssues.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-900 space-y-1">
          <p className="font-medium">組が成り立っていません（{groupIssues.length}件）</p>
          <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
            {groupIssues.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <p className="text-xs">直すまで確定できません。</p>
        </div>
      )}

      {(shortage.length > 0 || unplaced.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-medium">コマ数が足りない対象があります</p>
          <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
            {shortage.map((v, i) => (
              <li key={`s${i}`}>{v.message}</li>
            ))}
            {unplaced.map((u, i) => (
              <li key={`u${i}`}>
                {u.label}：あと{u.needed}コマ置けませんでした（{u.reason}）
              </li>
            ))}
          </ul>
          <p className="text-xs">
            このまま確定もできますが、足りないぶんは授業が開きません。
          </p>
        </div>
      )}

      {/* 集団の時間割。列は教室。 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">集団</h2>
          <span className="text-[11px] text-slate-400">
            列は教室（{setting.maxGroupRooms}室まで）。担当講師はシフトの自動作成で決まります
          </span>
        </div>
        <Grid
          grid={groupGrid}
          days={days}
          columnLabel={groupColumnLabel}
          editable={!run.appliedAt}
          empty="集団のクラスは配置されていません"
        />
      </section>

      {/* 個別の時間割。列は講師。 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900 text-sm">個別</h2>
          <span className="text-[11px] text-slate-400">
            列は講師1人ぶん。1人が{setting.indivMaxStudents}人まで見ます
          </span>
        </div>
        <Grid
          grid={indivGrid}
          days={days}
          columnLabel={indivColumnLabel}
          editable={!run.appliedAt}
          empty="個別の受講は配置されていません"
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 手直し：枠を足す */}
        {!run.appliedAt && targetKeys.length > 0 && periods.length > 0 && (
          <form
            action={addPlacement}
            className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="runId" value={run.id} />
            <span className="text-xs text-slate-500">枠を足す</span>
            <select
              name="targetKey"
              aria-label="対象"
              className="border border-slate-300 rounded px-1.5 py-1 text-xs max-w-56"
            >
              {targetKeys.map((k) => (
                <option key={k} value={k}>
                  {nameOfTarget(k)}
                </option>
              ))}
            </select>
            <select
              name="dayOfWeek"
              defaultValue={1}
              aria-label="曜日"
              className="border border-slate-300 rounded px-1.5 py-1 text-xs"
            >
              {WEEKDAYS.map((w, i) => (
                <option key={i} value={i}>
                  {w}曜
                </option>
              ))}
            </select>
            <select
              name="periodId"
              defaultValue={periods[0].id}
              aria-label="コマ"
              className="border border-slate-300 rounded px-1.5 py-1 text-xs"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-white"
            >
              足す
            </button>
            <span className="text-[10px] text-slate-400">
              足した枠も、上の検証に含まれます
            </span>
          </form>
        )}
      </section>

      {/* 確定 */}
      {!run.appliedAt && (
        <section className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <form action={applyRun}>
            <input type="hidden" name="runId" value={run.id} />
            <ConfirmSubmit
              message={`この案を ${termName} の時間割として確定しますか？\n\nクラスの時間割と個別の受講予定を、この期のぶんだけ入れ替えます。前の内容は消えます。`}
              className={`px-4 py-1.5 text-sm rounded text-white ${
                blocked
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
              disabled={blocked}
            >
              この案で確定する
            </ConfirmSubmit>
          </form>
          <p className="text-[11px] text-slate-500 flex-1 min-w-60">
            確定すると、クラスの時間割と個別の受講予定が
            <b className="text-slate-700">この期のぶんだけ入れ替わります</b>。
            そのあと「シフト計画」で必要人数を作り直してください。
          </p>
        </section>
      )}
    </div>
  );
}

// ---------- 何をどれだけ AI に書かせたか ----------

/**
 * 実行1回ぶんの重さを、モデルが返した実測値で出す。
 *
 * ---- なぜ画面に出すのか ----
 * ローカル実行の重さは **書かせた量でほぼ決まる。** 読む(prefill)は並列に効くが、
 * 書く(decode)は1トークンずつ進むため。いまは配置そのものを書かせているので、
 * 生徒が増えるほど比例して伸びる。**その比例が見えていないと、
 * 「AI にどこまで任せるか」を勘で決めることになる。**
 *
 * 1件あたりの出力量から、対象が増えたときの見込みも出す。任せ方を変えて
 * 出力が対象の数に依らなくなれば、実測がこの見込みを大きく下回る。
 */
function Measured({ run }: { run: RunRow }) {
  if (run.llmCalls === 0) return null;

  const perSec = outputTokensPerSec({
    calls: run.llmCalls,
    promptTokens: run.promptTokens,
    outputTokens: run.outputTokens,
    promptMs: run.promptMs,
    outputMs: run.outputMs,
  });
  const perTarget =
    run.targetCount > 0 ? Math.round(run.outputTokens / run.targetCount) : 0;

  // 生徒が増えたらどうなるか。いまの規模より大きい目安だけ出す。
  const scales = [100, 400].filter((n) => n > run.targetCount);
  const minutes = (ms: number) => Math.round(ms / 60000);

  return (
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
      <Stat label="呼んだ回数" value={`${run.llmCalls}回`} />
      <Stat label="読ませた" value={`${run.promptTokens.toLocaleString()}tok`} />
      <Stat label="書かせた" value={`${run.outputTokens.toLocaleString()}tok`} />
      {perSec > 0 && <Stat label="書く速さ" value={`${perSec.toFixed(1)}tok/秒`} />}
      {perTarget > 0 && (
        <Stat label="対象1件あたり" value={`${perTarget}tok`} hint="ここが下がらない限り、生徒が増えれば比例して重くなります" />
      )}
      {scales.map((n) => (
        <Stat
          key={n}
          label={`対象${n}件なら`}
          value={`約${minutes(projectOutputMs(
            {
              calls: run.llmCalls,
              promptTokens: run.promptTokens,
              outputTokens: run.outputTokens,
              promptMs: run.promptMs,
              outputMs: run.outputMs,
            },
            run.targetCount,
            n,
          ))}分`}
          hint="いまの任せ方のままだった場合の見込み（書く時間だけ）"
        />
      ))}
    </dl>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} className="flex items-baseline gap-1">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-700 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
