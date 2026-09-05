import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { movePlacementGroup, removePlacement } from "./actions";
import { WEEKDAYS } from "@/lib/dates";
import { roomLabel, type Grid as GridData } from "@/lib/timetable-view";

/**
 * 塾で配られている形の時間割表。
 *
 * 縦が時間帯、横が曜日。各曜日の中を教室（集団）か講師（個別）で列に割る。
 * **空いている列も描く。** 埋まっていない枠が見えないと、
 * あとどれだけ入れられるかが分からない。
 */
export function Grid({
  grid,
  days,
  /** 列の見出し。集団は "A" "B"、個別は "講師1" "講師2" */
  columnLabel,
  /** 確定後は手直しできないので、外すボタンを出さない */
  editable,
  empty,
}: {
  grid: GridData;
  days: number[];
  columnLabel: (index: number) => string;
  editable: boolean;
  empty: string;
}) {
  const hasAny = grid.rows.some((r) =>
    [...r.byDay.values()].some((cells) => cells.length > 0),
  );
  if (!hasAny) {
    return <p className="px-4 py-6 text-sm text-slate-400 text-center">{empty}</p>;
  }

  const cols = Array.from({ length: grid.columns }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[11px]">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 w-20 text-[10px] font-medium text-slate-500"
            >
              時間
            </th>
            {days.map((d) => (
              <th
                key={d}
                colSpan={grid.columns}
                className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
              >
                {WEEKDAYS[d]}曜日
              </th>
            ))}
          </tr>
          <tr>
            {days.flatMap((d) =>
              cols.map((c) => (
                <th
                  key={`${d}-${c}`}
                  className={`border border-slate-200 bg-slate-50/60 px-1 py-0.5 w-28 text-[10px] font-normal text-slate-400 ${
                    c === 0 ? "border-l-2 border-l-slate-300" : ""
                  }`}
                >
                  {columnLabel(c)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.period.id} className="align-top">
              <th className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 text-left font-normal">
                <div className="text-slate-700 tabular-nums">{row.period.startTime}</div>
                <div className="text-slate-400 tabular-nums">{row.period.endTime}</div>
              </th>

              {days.flatMap((d) => {
                const cells = row.byDay.get(d) ?? [];
                return cols.map((c) => {
                  const cell = cells[c];
                  return (
                    <td
                      key={`${row.period.id}-${d}-${c}`}
                      className={`border border-slate-200 p-1 h-16 ${
                        c === 0 ? "border-l-2 border-l-slate-300" : ""
                      } ${cell ? "" : "bg-slate-50/40"}`}
                    >
                      {cell && (
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-800 leading-tight flex items-baseline gap-1">
                            <span className="flex-1 min-w-0">{cell.title}</span>
                            {/* 組番号。この列を1人の講師が受け持つ */}
                            {cell.groupNo ? (
                              <span className="text-[9px] font-normal text-slate-400 shrink-0">
                                組{cell.groupNo}
                              </span>
                            ) : null}
                          </div>
                          {cell.items.map((i) => (
                            <div
                              key={i.id}
                              title={i.reason || (i.byHand ? "人が足した枠" : "")}
                              className="flex items-start gap-0.5 text-slate-600 leading-tight"
                            >
                              <span className="flex-1 min-w-0">
                                {/* 集団はタイトルがクラス名なので、中身は科目や備考だけ */}
                                {i.kind === "INDIV" ? i.name : i.note}
                                {i.byHand && (
                                  <span className="ml-0.5 text-[9px] text-slate-400">手</span>
                                )}
                              </span>
                              {/* 組を移す。**兄弟をまとめる／相性で分ける**といった
                                  人の判断を、次の実行まで残すための操作。 */}
                              {editable && i.kind === "INDIV" && cell.groupNo ? (
                                <form action={movePlacementGroup} className="shrink-0">
                                  <input type="hidden" name="id" value={i.id} />
                                  <input
                                    type="number"
                                    name="groupNo"
                                    min={1}
                                    max={99}
                                    defaultValue={cell.groupNo}
                                    aria-label={`${i.name}の組`}
                                    title="番号を変えて Enter で組を移せます"
                                    className="w-7 border border-transparent hover:border-slate-300 focus:border-slate-400 rounded text-[9px] text-slate-400 text-right bg-transparent"
                                  />
                                </form>
                              ) : null}
                              {editable && (
                                <form action={removePlacement} className="shrink-0">
                                  <input type="hidden" name="id" value={i.id} />
                                  <ConfirmSubmit
                                    message={`${i.name} のこの枠を案から外しますか？`}
                                    className="text-slate-300 hover:text-rose-600 leading-none"
                                  >
                                    ×
                                  </ConfirmSubmit>
                                </form>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                });
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 集団の列見出し。教室は決めていないので位置の記号にする。 */
export function groupColumnLabel(i: number): string {
  return roomLabel(i);
}

/** 個別の列見出し。誰が担当するかはシフトの自動作成が後で決める。 */
export function indivColumnLabel(i: number): string {
  return `講師${i + 1}`;
}
