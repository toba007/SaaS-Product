import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { setSubjectStream, updateSchoolSetting } from "./actions";
import {
  INDIV_MAX_LIMIT,
  SUBJECT_STREAM,
  SUBJECT_STREAM_LABEL,
  lessonStyleLabel,
  lessonStyles,
} from "@/lib/constants";

export const metadata = { title: "塾の設定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [setting, subjects] = await Promise.all([
    getSetting(),
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
  ]);
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

      {/* 科目の系統。個別の組を寄せる向きが決まる */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-sm">科目の系統</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            個別で<b className="text-slate-700">誰と誰を同じ講師が見るか</b>を決めるときに使います。
            講師が持てるのは得意な2科目ほどで、その2つは文系どうし・理系どうしになりやすいためです。
            <br />
            英語と国語は同じ人が持てますが、
            <b className="text-slate-700">英語と数学を両方持てる人はまずいません</b>。
            系統が分かっていれば、そういう組を最初から作らずに済みます。
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {subjects.map((s) => (
            <li key={s.id} className="px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-slate-800 w-20 shrink-0">{s.name}</span>
              <form action={setSubjectStream} className="flex items-center gap-1.5">
                <input type="hidden" name="subjectId" value={s.id} />
                <select
                  name="stream"
                  defaultValue={s.stream}
                  aria-label={`${s.name}の系統`}
                  className="border border-slate-300 rounded px-2 py-1 text-sm text-slate-900"
                >
                  {Object.values(SUBJECT_STREAM).map((v) => (
                    <option key={v} value={v}>
                      {SUBJECT_STREAM_LABEL[v]}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                >
                  保存
                </button>
              </form>
            </li>
          ))}
        </ul>
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
          「どちらでも」はどちらの組にも入れます。面談や小論文のように、
          塾によって扱いが違うものに使ってください。
          <b className="text-slate-600">
            講師の担当科目が登録されていれば、そちらが優先されます。
          </b>
          系統は登録が埋まるまでの当てにすぎません。
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
