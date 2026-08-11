"use client";

// FullCalendar v7 は日付を Temporal で扱う。ブラウザによってはまだ実装が無いので、
// ライブラリより先に polyfill を読み込む（import は書いた順に評価される）。
import "temporal-polyfill/global";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Calendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import multiMonthPlugin from "@fullcalendar/react/multimonth";
import listPlugin from "@fullcalendar/react/list";
import interactionPlugin from "@fullcalendar/react/interaction";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import jaLocale from "@fullcalendar/react/locales/ja";
import { moveEvent } from "./actions";
import { EVENT_KIND } from "@/lib/constants";
import { shiftDays } from "@/lib/dates";

export type Holiday = { date: string; name: string };

/** 講習期間。カレンダーの背景に敷いて、いつが夏期・冬期かを分かるようにする */
export type TermBand = {
  name: string;
  kind: string;
  startDate: string;
  endDate: string;
};

export type FcEvent = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  kind: string;
  note: string;
  /** "HH:MM"。null なら終日 */
  startTime: string | null;
  endTime: string | null;
};

/** 休校日は赤、行事は青。自前の月表示と同じ色分けに合わせる。 */
const COLOR: Record<string, { bg: string; text: string }> = {
  [EVENT_KIND.CLOSED]: { bg: "#fce8e6", text: "#c5221f" },
  [EVENT_KIND.EVENT]: { bg: "#e8f0fe", text: "#1967d2" },
};

type Fields = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};
/** 直前の場所。「元に戻す」で書き戻すために覚えておく */
type Undo = Fields & { id: string; title: string };

const p2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const fmtTime = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

/**
 * FullCalendar が返す期間を、塾HR の持ち方に直す。
 *
 * 文字列（startStr）ではなく Date から作っている。時間つきの予定だと
 * "2026-07-26T10:30:00+09:00" のようにタイムゾーンまで付いてきて、
 * 切り出し方を間違えるとずれるため。
 */
function toFields(
  start: Date | null,
  end: Date | null,
  allDay: boolean,
): Fields | null {
  if (!start) return null;
  if (allDay) {
    // 終日の end は「含まない」日なので1日戻す
    const last = end ? new Date(end.getTime() - 86400000) : start;
    return {
      startDate: fmtDate(start),
      endDate: fmtDate(last),
      startTime: "",
      endTime: "",
    };
  }
  const e = end ?? start;
  return {
    startDate: fmtDate(start),
    endDate: fmtDate(e),
    startTime: fmtTime(start),
    endTime: fmtTime(e),
  };
}

/**
 * 塾の予定を FullCalendar で表示する。
 *
 * 月・年は終日の予定を帯で、週・日は時間軸の上に置く（Google カレンダーと同じ）。
 * 終日の予定は、週・日でも上の「終日」の欄に出る。
 *
 * ドラッグの保存では確認を出さない。毎回ダイアログが出るとドラッグの意味がないため。
 * 代わりに「元に戻す」を出す。休校日を誤って動かすと講師のシフト希望の可否が
 * その場で変わるので、取り消せる道は必ず残す（Google カレンダーと同じ考え方）。
 */
export function FcCalendar({
  events,
  holidays,
  terms,
  ym,
  selectedDay,
}: {
  events: FcEvent[];
  /** 日本の祝日。休校を決める材料なので、塾の予定と並べて出す */
  holidays: Holiday[];
  /** 講習期間。背景に敷く */
  terms: TermBand[];
  ym: string;
  selectedDay: string;
}) {
  const router = useRouter();
  const [undo, setUndo] = useState<Undo | null>(null);

  const go = (qs: string) =>
    router.push(`/calendar?ym=${ym}&${qs}`, { scroll: false });

  const save = async (id: string, f: Fields) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("startDate", f.startDate);
    fd.set("endDate", f.endDate);
    fd.set("startTime", f.startTime);
    fd.set("endTime", f.endTime);
    await moveEvent(fd);
    router.refresh();
  };

  /** 動かす前の場所を覚えて、新しい場所を保存する */
  const applyMove = (info: {
    event: { id: string; start: Date | null; end: Date | null; allDay: boolean };
    oldEvent: {
      id: string;
      title: string;
      start: Date | null;
      end: Date | null;
      allDay: boolean;
    };
  }) => {
    const before = toFields(
      info.oldEvent.start,
      info.oldEvent.end,
      info.oldEvent.allDay,
    );
    const after = toFields(info.event.start, info.event.end, info.event.allDay);
    if (!before || !after) return;
    setUndo({ id: info.oldEvent.id, title: info.oldEvent.title, ...before });
    void save(info.event.id, after);
  };

  return (
    <div className="fc-wrap bg-white border border-slate-200 rounded-lg p-2 relative">
      <Calendar
        plugins={[
          dayGridPlugin,
          timeGridPlugin,
          multiMonthPlugin,
          listPlugin,
          interactionPlugin,
          classicThemePlugin,
        ]}
        initialView="dayGridMonth"
        initialDate={selectedDay}
        locale={jaLocale}
        // 日曜始まり。アプリの他の表に合わせる
        firstDay={0}
        headerToolbar={{
          left: "today prev,next",
          center: "title",
          // Google カレンダーと同じ並び。日本語は ja ロケールが持っている
          right: "multiMonthYear,dayGridMonth,timeGridWeek,timeGridDay,listMonth",
        }}
        // 年表示は12か月を並べる。狭い画面では自動で列数が減る
        views={{ multiMonthYear: { multiMonthMaxColumns: 3 } }}
        // 高さを内容に合わせる。囲みの中で二重スクロールにしない
        height="auto"
        // 時間軸は0時から24時まで出すが、開いた直後は夕方が見えるようにする。
        // 塾の授業は夕方から夜に集中していて、朝を見せても空欄が続くだけのため。
        scrollTime="15:00:00"
        // 30分刻み。塾のコマは80分などまちまちなので、細かすぎない粒度にしておく
        slotDuration="00:30:00"
        // 入りきらないぶんは「他n件」にまとめる
        dayMaxEvents={4}
        // 空きをドラッグして期間・時間帯を選べる
        selectable
        // 予定を掴んで動かす・端を引いて伸ばす
        editable
        /**
         * 講習期間を背景に敷く。
         * 自前の月表示が日付の横に「夏期」と出していた情報を、こちらに移したもの。
         * ふつうの予定にすると1行ぶん場所を取り、掴んで動かせてしまうので背景にする。
         */
        eventSources={[
          {
            events: terms.map((t) => ({
              id: `term-${t.startDate}`,
              // 名前は入れない。背景の文字は日付の数字と重なる（特に幅が狭いとき）。
              // 何の色かは、カレンダーの下の凡例と「期間（講習）」の画面で分かる。
              start: t.startDate,
              end: shiftDays(t.endDate, 1),
              allDay: true,
              display: "background",
              backgroundColor: "#fef3c7",
            })),
          },
        ]}
        events={[
          // 祝日は編集できない飾り。id を数字にしないことで、
          // 押されても塾の予定として開かないようにしてある。
          ...holidays.map((h) => ({
            id: `holiday-${h.date}`,
            title: h.name,
            start: h.date,
            allDay: true,
            editable: false,
            backgroundColor: "transparent",
            borderColor: "transparent",
            textColor: "#d93025",
            classNames: ["fc-holiday"],
          })),
          ...events.map((e) => {
            const timed = e.startTime !== null && e.endTime !== null;
            return {
              id: String(e.id),
              title: e.title,
              // 時間つきは "日付T時刻"、終日は日付だけ。
              // 終日の end は「含まない」日なので1日足す。
              start: timed ? `${e.startDate}T${e.startTime}` : e.startDate,
              end: timed ? `${e.endDate}T${e.endTime}` : shiftDays(e.endDate, 1),
              allDay: !timed,
              backgroundColor: COLOR[e.kind]?.bg,
              borderColor: COLOR[e.kind]?.bg,
              textColor: COLOR[e.kind]?.text,
              extendedProps: { note: e.note },
            };
          }),
        ]}
        /**
         * マスの中身を自前で描く。
         *
         * v7 のテーマはクラス名がハッシュ化されていて、CSS から狙えない。
         * 幅が狭いと文字が中央に寄って読みづらいので、
         * 「時刻＋タイトルを左詰め、はみ出しは …」に固定する。
         */
        // 背景の帯には何も描かない（色だけ敷く）
        backgroundEventContent={() => <></>}
        /** 日付の数字はマスの上・中央に置く */
        dayCellTopContent={(arg) => (
          <div className="w-full text-center">{arg.dayNumberText}</div>
        )}
        eventContent={(arg) => {
          // 念のため。背景に回ってきたものは何も描かない
          if (arg.event.display === "background") return <></>;
          return (
            <div className="flex items-center gap-1 min-w-0 w-full px-1 text-left">
              {arg.timeText && (
                <span className="shrink-0 text-[10px] opacity-80 tabular-nums">
                  {arg.timeText}
                </span>
              )}
              <span className="truncate text-[11px] leading-tight">
                {arg.event.title}
              </span>
            </div>
          );
        }}
        dateClick={(info) => go(`day=${info.dateStr}`)}
        select={(info) => {
          const f = toFields(info.start, info.end, info.allDay);
          if (!f) return;
          const range = f.endDate !== f.startDate ? `&to=${f.endDate}` : "";
          // 時間軸の上でなぞったときは、時刻まで入れた状態でフォームを開く
          const time = f.startTime ? `&st=${f.startTime}&et=${f.endTime}` : "";
          go(`day=${f.startDate}${range}${time}`);
        }}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          // 祝日は塾の予定ではないので、押しても開かない
          if (!/^\d+$/.test(info.event.id)) return;
          // 予定を押したときは「追加」ではなく「中身と削除」を開く
          go(`event=${info.event.id}`);
        }}
        eventDrop={applyMove}
        eventResize={applyMove}
        /**
         * 表示している年が変わったら、URL の ?ym= も合わせる。
         * サーバー側は ?ym= の年ぶんの予定を取っているので、
         * ここを合わせないと別の年に移っても予定が出ない。
         *
         * 年が変わったときだけにしているのは、月送りのたびに再取得すると
         * 画面がちらつくため（予定は年単位でまとめて取っている）。
         */
        datesSet={(info) => {
          const shownYear = info.startStr.slice(0, 4);
          if (shownYear && shownYear !== ym.slice(0, 4)) {
            router.replace(`/calendar?ym=${shownYear}-01`, { scroll: false });
          }
        }}
      />

      {undo && (
        <div className="sticky bottom-2 mt-2 flex items-center gap-3 bg-slate-900 text-white text-sm rounded-lg px-4 py-2.5 shadow-lg">
          <span className="flex-1 truncate">「{undo.title}」を動かしました</span>
          <button
            type="button"
            onClick={async () => {
              await save(undo.id, undo);
              setUndo(null);
            }}
            className="font-medium text-indigo-300 hover:text-indigo-200 shrink-0"
          >
            元に戻す
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label="閉じる"
            className="text-slate-400 hover:text-white shrink-0"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
