import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { addPeriod, copyBand, deletePeriod, updatePeriod } from "./actions";
import {
  GRADE_BAND,
  GRADE_BAND_LABEL,
  GRADE_BAND_ORDER,
  TERM_KIND,
  TERM_KIND_LABEL,
  TERM_KIND_ORDER,
} from "@/lib/constants";
import {
  groupByBand,
  lengthOf,
  overlappingPairs,
  type PeriodLite,
} from "@/lib/periods";

export const metadata = { title: "コマ・時間割｜塾HR" };
export const dynamic = "force-dynamic";

export default async function PeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const sp = await searchParams;
  const termKind = TERM_KIND_ORDER.includes(sp.kind ?? "")
    ? sp.kind!
    : TERM_KIND.REGULAR;

  const rows = await prisma.period.findMany({
    include: {
      _count: {
        select: {
          lessons: true,
          requests: true,
          assignments: true,
          duties: true,
          demands: true,
          classSessions: true,
        },
      },
    },
  });

  const periods: PeriodLite[] = rows.map((p) => ({
    id: p.id,
    termKind: p.termKind,
    gradeBand: p.gradeBand,
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    order: p.order,
  }));

  // 使われているコマは消させない。消すと、そこにあった希望や割当が黙って消える。
  const usedCount = new Map(
    rows.map((p) => [p.id, Object.values(p._count).reduce((a, b) => a + b, 0)]),
  );

  const byBand = groupByBand(periods, termKind);
  const clashes = overlappingPairs(periods.filter((p) => p.termKind === termKind));
  const countOf = (kind: string) => periods.filter((p) => p.termKind === kind).length;
  const filledBands = GRADE_BAND_ORDER.filter((b) => (byBand.get(b)?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">コマ・時間割</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            1日のコマの区切りを登録します。講師が希望を出す枠も、自動作成が回る単位もこれです。
          </p>
        </div>
        <Link
          href="/settings"
          className="text-sm text-indigo-600 hover:underline shrink-0 mt-1"
        >
          塾の設定へ
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">学年帯ごとに分けて登録できます。</b>
          小学生は17:40から40分、中学生は19:15から50分、のように時間帯が違う塾向けです。
          学年で分けない塾は「全学年」だけを登録してください。
        </p>
        <p>
          <b className="text-slate-700">高校生は、登録が無ければ中学生の枠を使います。</b>
          同じ時間割なら、高校生ぶんを登録する必要はありません。
        </p>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {TERM_KIND_ORDER.map((k) => (
          <Link
            key={k}
            href={`/settings/periods?kind=${k}`}
            className={`px-3 py-1.5 text-sm rounded border ${
              termKind === k
                ? "bg-slate-900 border-slate-900 text-white font-medium"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {TERM_KIND_LABEL[k]}
            <span
              className={`ml-1.5 text-[10px] ${
                termKind === k ? "text-slate-300" : "text-slate-400"
              }`}
            >
              {countOf(k)}
            </span>
          </Link>
        ))}
      </div>

      {clashes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-medium">時間帯が重なっているコマがあります</p>
          <ul className="text-xs space-y-0.5">
            {clashes.map((c, i) => (
              <li key={i}>
                {GRADE_BAND_LABEL[c.a.gradeBand]}
                {c.a.name}（{c.a.startTime}〜{c.a.endTime}）と{" "}
                {GRADE_BAND_LABEL[c.b.gradeBand]}
                {c.b.name}（{c.b.startTime}〜{c.b.endTime}）
                {c.sameBand && (
                  <b className="ml-1 text-amber-950">
                    ※ 同じ学年帯どうしです。入力の間違いではありませんか
                  </b>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            並行して開けているなら問題ありません。ただし
            <b>その2コマに同じ講師は入れません。</b>自動作成もそう扱います。
          </p>
        </div>
      )}

      {GRADE_BAND_ORDER.map((band) => {
        const list = byBand.get(band) ?? [];
        return (
          <section
            key={band}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-900 text-sm">
                {GRADE_BAND_LABEL[band]}
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  {list.length}コマ
                </span>
              </h2>
              {list.length === 0 && filledBands.length > 0 && (
                <form action={copyBand} className="flex items-center gap-1.5">
                  <input type="hidden" name="termKind" value={termKind} />
                  <input type="hidden" name="to" value={band} />
                  <select
                    name="from"
                    defaultValue={filledBands[0]}
                    className="border border-slate-300 rounded px-1.5 py-1 text-xs"
                  >
                    {filledBands.map((b) => (
                      <option key={b} value={b}>
                        {GRADE_BAND_LABEL[b]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                  >
                    から写す
                  </button>
                </form>
              )}
            </div>

            {list.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-400">
                まだ登録がありません。
                {band === GRADE_BAND.HIGH &&
                  "高校生は中学生と同じ枠でよければ、このままで構いません。"}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                    <th className="text-left font-medium px-4 py-1.5">
                      名前・開始・終了
                    </th>
                    <th className="px-2 py-1.5 w-40" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const used = usedCount.get(p.id) ?? 0;
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-0 py-0">
                          <form
                            action={updatePeriod}
                            id={`p${p.id}`}
                            className="flex flex-wrap items-center gap-2 px-4 py-1.5"
                          >
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              name="name"
                              defaultValue={p.name}
                              maxLength={20}
                              aria-label="コマの名前"
                              className="w-24 border border-slate-200 rounded px-2 py-1 text-sm"
                            />
                            <input
                              name="startTime"
                              type="time"
                              defaultValue={p.startTime}
                              aria-label="開始時刻"
                              className="w-28 border border-slate-200 rounded px-2 py-1 text-sm tabular-nums"
                            />
                            <span className="text-xs text-slate-400">〜</span>
                            <input
                              name="endTime"
                              type="time"
                              defaultValue={p.endTime}
                              aria-label="終了時刻"
                              className="w-28 border border-slate-200 rounded px-2 py-1 text-sm tabular-nums"
                            />
                            <span className="text-xs text-slate-500 tabular-nums">
                              {lengthOf(p)}分
                            </span>
                          </form>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          <button
                            type="submit"
                            form={`p${p.id}`}
                            className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                          >
                            保存
                          </button>
                          {used > 0 ? (
                            <span
                              className="ml-2 text-[10px] text-slate-400"
                              title="希望・割当・授業などで使われているコマは消せません。時刻を直してください。"
                            >
                              使用中{used}件
                            </span>
                          ) : (
                            <form action={deletePeriod} className="inline">
                              <input type="hidden" name="id" value={p.id} />
                              <ConfirmSubmit
                                message={`${GRADE_BAND_LABEL[band]}${p.name}（${p.startTime}〜${p.endTime}）を削除しますか？`}
                                className="ml-2 text-[10px] text-slate-400 hover:text-rose-600"
                              >
                                削除
                              </ConfirmSubmit>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <form
              action={addPeriod}
              className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="termKind" value={termKind} />
              <input type="hidden" name="gradeBand" value={band} />
              <input
                name="name"
                placeholder="1限"
                maxLength={20}
                required
                aria-label="コマの名前"
                className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
              />
              <input
                name="startTime"
                type="time"
                required
                aria-label="開始時刻"
                className="w-28 border border-slate-300 rounded px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-xs text-slate-400">〜</span>
              <input
                name="endTime"
                type="time"
                required
                aria-label="終了時刻"
                className="w-28 border border-slate-300 rounded px-2 py-1 text-sm tabular-nums"
              />
              <button
                type="submit"
                className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800"
              >
                追加
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
