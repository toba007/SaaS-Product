"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { EVENT_KIND } from "@/lib/constants";
import { REPEAT, REPEAT_ORDER, expandRepeat } from "@/lib/recurrence";
import { randomUUID } from "node:crypto";

/** ok は「追加が通った」印。初期状態と区別が付かないと、画面側で閉じる判断ができない。 */
export type EventState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/calendar");
  // 講師側のカレンダーにも出るので、そちらも作り直す
  revalidatePath("/t");
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/attendance");
  revalidatePath("/");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/**
 * 終日か時間つきかを、フォームの入力から決める。
 *
 * 休校日は必ず終日にする。isClosedDate() は日付だけで判定しているので、
 * 時間を持たせると「13時から休校」がその日ぜんぶ休校として効いてしまう。
 */
function readTimes(
  formData: FormData,
  kind: string,
): { startTime: string | null; endTime: string | null } | { error: string } {
  if (kind === EVENT_KIND.CLOSED) return { startTime: null, endTime: null };
  if (formData.get("allDay") === "on") return { startTime: null, endTime: null };

  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  if (!TIME.test(startTime) || !TIME.test(endTime)) {
    return { error: "開始時刻と終了時刻を入れてください" };
  }
  return { startTime, endTime };
}

/** 塾の予定を追加する。1日でも期間でも同じ形。 */
export async function addEvent(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const kind = String(formData.get("kind") ?? EVENT_KIND.EVENT);
  const note = String(formData.get("note") ?? "").trim();

  if (!title) return { error: "予定の名前を入れてください" };
  if (!DATE.test(startDate)) return { error: "開始日を入れてください" };

  // 終了日を空にしたら1日だけの予定
  const endDate = endRaw === "" ? startDate : endRaw;
  if (!DATE.test(endDate)) return { error: "終了日の形式が正しくありません" };
  if (endDate < startDate) return { error: "終了日が開始日より前になっています" };

  // 繰り返しは日付の行に展開して保存する（理由は lib/recurrence.ts）
  const repeatRaw = String(formData.get("repeat") ?? REPEAT.NONE);
  const repeat = REPEAT_ORDER.includes(repeatRaw) ? repeatRaw : REPEAT.NONE;
  const until = String(formData.get("until") ?? "").trim();
  if (repeat !== REPEAT.NONE && !DATE.test(until)) {
    return { error: "繰り返しの終わりの日を入れてください" };
  }
  if (repeat !== REPEAT.NONE && until < endDate) {
    return { error: "繰り返しの終わりが、最初の予定より前になっています" };
  }

  const times = readTimes(formData, kind);
  if ("error" in times) return { error: times.error };
  // 同じ日の中で終わる予定なら、終わりが始まりより後であること
  if (times.startTime && startDate === endDate && times.endTime! <= times.startTime) {
    return { error: "終了時刻が開始時刻より後になっていません" };
  }

  const occurrences = expandRepeat(startDate, endDate, repeat, until);
  // まとめて消せるように、同じまとまりだと分かる印を付ける
  const seriesId = occurrences.length > 1 ? randomUUID() : null;

  await prisma.schoolEvent.createMany({
    data: occurrences.map((o) => ({
      title,
      startDate: o.startDate,
      endDate: o.endDate,
      kind,
      note,
      seriesId,
      ...times,
    })),
  });

  refresh();
  return { ok: true };
}

/**
 * 予定を消す。
 *
 * 繰り返しで作ったものは、Google カレンダーと同じく範囲を選べるようにする。
 *   this  … この予定だけ（既定）
 *   after … この予定以降
 *   all   … まとまり全部
 */
export async function deleteEvent(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const scope = String(formData.get("scope") ?? "this");
  const target = await prisma.schoolEvent.findUnique({ where: { id } });
  if (!target) return;

  if (target.seriesId && (scope === "after" || scope === "all")) {
    await prisma.schoolEvent.deleteMany({
      where: {
        seriesId: target.seriesId,
        // 「以降」は開始日で切る。同じ日に2件あっても取りこぼさない。
        ...(scope === "after" ? { startDate: { gte: target.startDate } } : {}),
      },
    });
  } else {
    await prisma.schoolEvent.delete({ where: { id } });
  }

  refresh();

  // ダイアログから消したときは ?event= を落として閉じる。
  // 行き先はカレンダー内に限る（外部URLを入れられると転送に使えてしまう）。
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/calendar")) redirect(next);
}

/**
 * 予定の中身を書き換える。
 *
 * 今まで「消して入れ直す」しか無かったが、名前の打ち間違いを直すのに
 * 削除の確認まで通らせるのは無理がある（Google カレンダーも鉛筆1つで直せる）。
 */
export async function updateEvent(
  _prev: EventState,
  formData: FormData,
): Promise<EventState> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const kind = String(formData.get("kind") ?? EVENT_KIND.EVENT);
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) return { error: "予定が見つかりません" };
  if (!title) return { error: "予定の名前を入れてください" };
  if (!DATE.test(startDate)) return { error: "開始日を入れてください" };

  const endDate = endRaw === "" ? startDate : endRaw;
  if (!DATE.test(endDate)) return { error: "終了日の形式が正しくありません" };
  if (endDate < startDate) return { error: "終了日が開始日より前になっています" };

  const times = readTimes(formData, kind);
  if ("error" in times) return { error: times.error };
  if (times.startTime && startDate === endDate && times.endTime! <= times.startTime) {
    return { error: "終了時刻が開始時刻より後になっていません" };
  }

  await prisma.schoolEvent.update({
    where: { id },
    data: { title, startDate, endDate, kind, note, ...times },
  });

  refresh();
  return { ok: true };
}

/**
 * 予定を掴んで動かした／端を引っぱって伸ばしたときの保存。
 *
 * 確認を挟まずそのまま保存する。毎回ダイアログが出るとドラッグの意味がないため。
 * 代わりに画面側で「元に戻す」を出す（Google カレンダーと同じ考え方）。
 * 戻すときも同じ関数を、元の日付で呼ぶだけでよい。
 */
export async function moveEvent(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!Number.isInteger(id) || id <= 0) return;
  if (!DATE.test(startDate) || !DATE.test(endDate)) return;
  if (endDate < startDate) return;

  // 時間つきの予定を時間軸の上で動かしたときは、時刻も一緒に入れ替わる。
  // 空で来たら終日に戻す（時間軸から終日の欄へ放り込んだ場合）。
  const st = String(formData.get("startTime") ?? "");
  const et = String(formData.get("endTime") ?? "");
  const startTime = TIME.test(st) ? st : null;
  const endTime = TIME.test(et) ? et : null;

  await prisma.schoolEvent.update({
    where: { id },
    data: { startDate, endDate, startTime, endTime },
  });
  refresh();
}
