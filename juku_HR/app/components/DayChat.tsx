import { thread, markThreadRead } from "@/lib/comments";
import { formatDateJP } from "@/lib/constants";
import { ChatBox } from "./ChatBox";

/**
 * その日の備考欄。講師のシフト提出カレンダー・確定シフトのカレンダー・
 * 管理者のシフト表の3箇所から、同じスレッドを開く。
 *
 * markRead は「利用者が自分でその日を開いたか」で決める。
 * 日付を選んでいない既定表示のときまで既読にすると、本人が見ていないのに
 * 未読が消えて、連絡が埋もれる。
 */
export async function DayChat({
  teacherId,
  date,
  viewerRole,
  markRead = true,
}: {
  teacherId: number;
  date: string;
  viewerRole: string;
  markRead?: boolean;
}) {
  // 既読にしてから読む。順番が逆だと、この画面にだけ古い未読が残って見える。
  if (markRead) await markThreadRead(teacherId, date, viewerRole);
  const messages = await thread(teacherId, date);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">備考・やりとり</h3>
        <span className="text-[10px] text-slate-400">{formatDateJP(date)}</span>
      </div>
      <ChatBox
        messages={messages}
        viewerRole={viewerRole}
        teacherId={teacherId}
        date={date}
      />
    </section>
  );
}
