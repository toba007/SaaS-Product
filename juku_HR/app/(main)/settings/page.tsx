import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { updateSchoolSetting } from "./actions";
import { INDIV_MAX_LIMIT, lessonStyleLabel, lessonStyles } from "@/lib/constants";

export const metadata = { title: "塾の設定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const setting = await getSetting();
  const styles = lessonStyles(setting.indivMaxStudents);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">塾の設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          塾によって違う数字をここで登録します。必要人数の計算に直接効きます。
        </p>
      </div>

      <form
        action={updateSchoolSetting}
        className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100"
      >
        <Row
          name="indivMaxStudents"
          label="個別で1人がみる生徒の上限"
          value={setting.indivMaxStudents}
          min={1}
          max={INDIV_MAX_LIMIT}
          unit="人まで"
          help="「1対4まで見てよい」なら 4。必要な講師数は 生徒数 ÷ この数 で決まります。"
        />
        <Row
          name="maxGroupRooms"
          label="同時に使える集団教室"
          value={setting.maxGroupRooms}
          min={0}
          max={99}
          unit="室"
          help="同じ時間に何クラスまで立てられるかの上限です。どの教室を使うかまでは決めません。"
        />
        <Row
          name="maxIndivRooms"
          label="同時に使える個別ブース"
          value={setting.maxIndivRooms}
          min={0}
          max={99}
          unit="室"
          help="考え方は集団教室と同じです。"
        />

        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            範囲の外の値を入れると、保存時に範囲内へ丸められます
          </p>
          <button
            type="submit"
            className="px-4 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800"
          >
            保存
          </button>
        </div>
      </form>

      <section className="bg-white border border-slate-200 rounded-lg px-4 py-3 space-y-2">
        <h2 className="font-semibold text-slate-900 text-sm">
          いま選べる授業形態
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => (
            <span
              key={s}
              className="text-xs bg-slate-100 text-slate-700 rounded px-2 py-0.5"
            >
              {lessonStyleLabel(s)}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          上の「個別で1人がみる生徒の上限」を変えると、ここが増減します。
          <b className="text-slate-700">給与のコマ単価も、この形態ごとに設定します。</b>
          上限を増やしたら{" "}
          <Link href="/payroll/settings" className="text-indigo-600 hover:underline">
            給与設定
          </Link>{" "}
          で新しい形態の単価を入れてください。入っていないと、その形態で働いた日が0円で計算されます。
        </p>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg px-4 py-3 space-y-1.5 text-xs text-slate-500">
        <p>
          <b className="text-slate-700">コマの時間帯は別の画面で登録します。</b>{" "}
          <Link href="/settings/periods" className="text-indigo-600 hover:underline">
            コマ・時間割
          </Link>{" "}
          から、学年帯ごとの開始・終了時刻を入れてください。
        </p>
        <p>
          <b className="text-slate-700">教室は「数」だけ持ちます。</b>
          どの授業をどの部屋でやるかまでは決めません。
          その日その科目に何人出勤しているかで、実際に使う部屋数が決まるためです。
        </p>
      </section>
    </div>
  );
}

function Row({
  name,
  label,
  value,
  min,
  max,
  unit,
  help,
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  help: string;
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <label htmlFor={name} className="text-sm text-slate-900">
          {label}
        </label>
        <p className="text-[11px] text-slate-400 mt-0.5">{help}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          id={name}
          name={name}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-right tabular-nums"
        />
        <span className="text-xs text-slate-500 w-12">{unit}</span>
      </div>
    </div>
  );
}
