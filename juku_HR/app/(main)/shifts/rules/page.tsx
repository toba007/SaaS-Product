import { prisma } from "@/lib/prisma";
import { resetShiftRule, saveShiftRule } from "./actions";
import { DEFAULT_SHIFT_RULE, EMPLOYMENT_LABEL } from "@/lib/constants";

export const metadata = { title: "勤務上限｜塾HR" };
export const dynamic = "force-dynamic";

const FIELDS = [
  { name: "maxPerDay", label: "1日の上限", unit: "コマ" },
  { name: "maxPerWeek", label: "週の上限", unit: "コマ" },
  { name: "maxConsecutive", label: "連続の上限", unit: "コマ" },
  { name: "minPerWeek", label: "週の下限", unit: "コマ" },
] as const;

export default async function ShiftRulesPage() {
  const teachers = await prisma.teacher.findMany({
    where: { active: true },
    include: { shiftRule: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">勤務上限</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          自動作成がこの範囲を超えないようにします。空欄・範囲外は既定値に戻ります。
        </p>
      </div>

      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        既定値（1日{DEFAULT_SHIFT_RULE.maxPerDay}・週{DEFAULT_SHIFT_RULE.maxPerWeek}・連続
        {DEFAULT_SHIFT_RULE.maxConsecutive}）は<b>仮置きの数字</b>です。
        労働時間のルールや、社員と学生講師で分けるかどうかを塾に確認したうえで決め直してください。
      </p>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-3xl">
          <thead>
            <tr className="text-[11px] text-slate-400 border-b border-slate-200">
              <th className="text-left font-medium px-4 py-2 w-44">講師</th>
              {FIELDS.map((f) => (
                <th key={f.name} className="text-left font-medium px-2 py-2 w-24">
                  {f.label}
                  <div className="font-normal text-slate-300">{f.unit}</div>
                </th>
              ))}
              <th className="text-left font-medium px-2 py-2 w-28">設定</th>
              <th className="px-4 py-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => {
              const r = t.shiftRule;
              return (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="text-sm text-slate-900 truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {EMPLOYMENT_LABEL[t.employment]}
                    </div>
                  </td>
                  <td colSpan={FIELDS.length + 2} className="px-0 py-0">
                    <form
                      action={saveShiftRule}
                      className="flex items-center gap-2 px-2 py-2"
                    >
                      <input type="hidden" name="teacherId" value={t.id} />
                      {FIELDS.map((f) => (
                        <input
                          key={f.name}
                          type="number"
                          name={f.name}
                          min={0}
                          max={99}
                          defaultValue={r ? r[f.name] : DEFAULT_SHIFT_RULE[f.name]}
                          aria-label={`${t.name} ${f.label}`}
                          className={`w-20 border rounded px-2 py-1 text-sm tabular-nums ${
                            r
                              ? "border-slate-200 text-slate-900"
                              : "border-slate-100 text-slate-400"
                          }`}
                        />
                      ))}
                      <span className="w-28 text-[11px] text-slate-400">
                        {r ? "個別に設定" : "既定値のまま"}
                      </span>
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50"
                      >
                        保存
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {teachers.some((t) => t.shiftRule) && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">既定値に戻す</h2>
          <div className="flex flex-wrap gap-2">
            {teachers
              .filter((t) => t.shiftRule)
              .map((t) => (
                <form key={t.id} action={resetShiftRule}>
                  <input type="hidden" name="teacherId" value={t.id} />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50"
                  >
                    {t.name}
                  </button>
                </form>
              ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1.5">
        <p>
          <b className="text-slate-700">連続の上限</b>
          は、休憩を取れなくなるのを防ぐためのものです。1日の上限とは別に効きます。
        </p>
        <p>
          <b className="text-slate-700">週の下限</b>
          は、社員のように「最低これだけは入ってもらう」人に使います。0 なら下限なしです。
          候補として成立しない場合（希望が足りない等）は下限を満たせないこともあります。
        </p>
        <p>
          <b className="text-slate-700">講師本人は変更できません。</b>
          自分の上限を上げられると、入りたいコマに多く入れてしまうためです。
        </p>
      </div>
    </div>
  );
}
