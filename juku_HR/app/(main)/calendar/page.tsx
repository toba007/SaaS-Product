import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EventForm } from "./EventForm";
import { FcCalendar } from "./FcCalendar";
import { AddEventDialog } from "./AddEventDialog";
import { EventDialog } from "./EventDialog";
import { Shortcuts } from "./Shortcuts";
import { deleteEvent } from "./actions";
import { ConfirmSubmit } from "@/app/components/ConfirmSubmit";
import { holidaysBetween } from "@/lib/holidays";
import {
  EVENT_KIND,
  EVENT_KIND_LABEL,
  formatDateJP,
  todayISO,
} from "@/lib/constants";
import { addMonths, formatYm, parseYm } from "@/lib/dates";

export const metadata = { title: "塾の予定｜塾HR" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    ym?: string;
    day?: string;
    to?: string;
    st?: string;
    et?: string;
    event?: string;
  }>;
}) {
  const sp = await searchParams;
  const ym = parseYm(sp.ym);

  // 日付を押すと ?day= が付き、その日の予定を追加するダイアログが開く。
  // 開閉を画面内の状態ではなく URL で持つのは、カレンダー本体（クライアント部品）と
  // 右の一覧（サーバー部品）のどちらから押されても同じものを開けるようにするため。
  // 戻るボタンで閉じられるのと、日付付きのURLを人に渡せるのも都合がよい。
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const pickedDay = sp.day && DATE.test(sp.day) ? sp.day : null;
  // ドラッグで期間を選んだとき。開始日より前なら無視する
  const pickedTo =
    sp.to && DATE.test(sp.to) && pickedDay && sp.to >= pickedDay ? sp.to : undefined;
  // 時間軸の上でなぞったときの時刻
  const TIME = /^\d{2}:\d{2}$/;
  const pickedSt = sp.st && TIME.test(sp.st) ? sp.st : undefined;
  const pickedEt = sp.et && TIME.test(sp.et) ? sp.et : undefined;
  const selectedDay = pickedDay ?? todayISO();


  // 年表示に切り替えても足りるよう、その年ぶんをまとめて取る
  const from = `${ym.year}-01-01`;
  const to = `${ym.year}-12-31`;

  const [events, terms] = await Promise.all([
    prisma.schoolEvent.findMany({
      where: { endDate: { gte: from }, startDate: { lte: to } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  // カレンダーに渡す基準日。表示中の月から外れた日を渡すと別の月が開いてしまう。
  const todayYm = parseYm(todayISO().slice(0, 7));
  const inThisMonth = (d: string) => d.startsWith(formatYm(ym));
  const fcDate = pickedDay && inThisMonth(pickedDay)
    ? pickedDay
    : inThisMonth(todayISO())
      ? todayISO()
      : `${formatYm(ym)}-01`;

  // 予定を押したときは、その中身と削除を出す
  const pickedEvent = sp.event
    ? (events.find((e) => e.id === Number(sp.event)) ?? null)
    : null;

  // 日本の祝日。休校を決める材料なので、塾の予定と並べて出す（lib/holidays.ts）
  const holidays = holidaysBetween(from, to);
  const closedCount = events.filter((e) => e.kind === EVENT_KIND.CLOSED).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">塾の予定</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ここで入れた予定は、講師のシフト画面のカレンダーにも出ます。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/calendar/terms"
            className="px-3 py-1.5 text-sm rounded border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            期間（講習）
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-3">
          <FcCalendar
            events={events}
            holidays={holidays}
            terms={terms.filter((t) => t.kind !== "REGULAR")}
            ym={formatYm(ym)}
            selectedDay={fcDate}
          />
          <p className="text-[11px] text-slate-400">
            <span className="inline-block w-3 h-3 align-middle rounded-sm bg-amber-100 border border-amber-200 mr-1" />
            黄色の背景は
            <Link href="/calendar/terms" className="underline mx-0.5">
              講習期間
            </Link>
            、<span className="text-rose-600">赤い文字</span>は祝日です。
            日付を押すと予定を追加、予定を押すと中身の確認・書き換え・削除ができます
          </p>
        </div>

        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2.5 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900 text-sm">予定を追加</h2>
            </div>
            <EventForm key={selectedDay} defaultDate={selectedDay} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-900 text-sm">
                {ym.year}年の予定
              </h2>
              <span className="text-[11px] text-slate-400">
                {events.length}件（休校{closedCount}件）
              </span>
            </div>
            {events.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">
                まだ予定がありません
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.id} className="px-3 py-2 flex items-start gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                        e.kind === EVENT_KIND.CLOSED
                          ? "bg-rose-100 text-rose-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {EVENT_KIND_LABEL[e.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-900 truncate">
                        {e.title}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {e.startDate === e.endDate
                          ? formatDateJP(e.startDate)
                          : `${formatDateJP(e.startDate)} 〜 ${formatDateJP(e.endDate)}`}
                        {e.startTime && ` ${e.startTime}〜${e.endTime}`}
                        {e.note && <span className="ml-1">／{e.note}</span>}
                      </div>
                    </div>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <ConfirmSubmit
                        message={`「${e.title}」を削除しますか？${e.kind === EVENT_KIND.CLOSED ? " 休校日でなくなると、この日にシフトを出せるようになります。" : ""}`}
                        className="text-[10px] text-slate-400 hover:text-rose-600 shrink-0"
                      >
                        削除
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* キーボード操作。Google カレンダーと同じ割り当て */}
      <Shortcuts
        prevHref={`/calendar?ym=${formatYm(addMonths(ym, -1))}`}
        nextHref={`/calendar?ym=${formatYm(addMonths(ym, 1))}`}
        todayHref={`/calendar?ym=${formatYm(todayYm)}`}
        createHref={`/calendar?ym=${formatYm(ym)}&day=${selectedDay}`}
      />

      {pickedDay && (
        <AddEventDialog
          date={pickedDay}
          endDate={pickedTo}
          startTime={pickedSt}
          endTime={pickedEt}
          closeHref={`/calendar?ym=${formatYm(ym)}`}
        />
      )}

      {pickedEvent && (
        <EventDialog
          event={{
            ...pickedEvent,
            seriesCount: pickedEvent.seriesId
              ? events.filter((e) => e.seriesId === pickedEvent.seriesId).length
              : 1,
          }}
          closeHref={`/calendar?ym=${formatYm(ym)}`}
        />
      )}
    </div>
  );
}
