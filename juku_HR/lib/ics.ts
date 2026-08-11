/**
 * 講師のカレンダーアプリ（Googleカレンダー・iOS標準など）に渡す iCalendar を作る。
 *
 * Prisma に依存しない純粋関数にしてある。DB を用意せずに書式を検証できるようにするため。
 * 書式が少しでも崩れるとカレンダーアプリが黙って読み込みをやめるので、ここは自前で
 * 組み立てたうえで検証スクリプトを付けている。
 */

export type IcsEvent = {
  /** 予定を一意に指すID。変えると別の予定として増えるので、DBのidから決める */
  uid: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM"（日本時間） */
  startTime: string;
  endTime: string;
  summary: string;
  description?: string;
  location?: string;
};

/**
 * 日本時間の日付＋時刻を、UTC の表記に直す。
 *
 * TZID と VTIMEZONE を持たせる書き方もあるが、あれは読み手側の対応差が出やすい。
 * 日本にサマータイムは無く UTC+9 で固定なので、9時間引いて Z を付ければ
 * どのカレンダーアプリでも必ず正しい時刻になる。
 */
export function toUtcStamp(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // 0時台の予定は前日の UTC になるが、Date.UTC が桁上がりを面倒みてくれる
  return formatStamp(new Date(Date.UTC(y, m - 1, d, hh - 9, mm)));
}

function formatStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** TEXT 値に入れてはいけない文字を打ち消す。ここを抜くと1件の崩れで全体が読めなくなる。 */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * 1行75オクテットで折り返す（RFC 5545）。
 *
 * 数え方が文字数ではなくオクテットなので、日本語だと1文字3バイトで効いてくる。
 * UTF-8 の途中で切ると文字化けするため、継続バイトの手前まで戻してから折る。
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let i = 0;
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(i, end).toString("utf8"));
    i = end;
    limit = 74; // 継続行は先頭に空白が1つ入るぶん、入れられる量が減る
  }
  return parts.join("\r\n ");
}

export type IcsOptions = {
  /** カレンダーアプリ側に出る名前 */
  calendarName: string;
  /** 作った時刻。検証で固定したいので外から渡せるようにしている */
  now?: Date;
};

/** 予定の一覧から iCalendar 本文を作る */
export function buildIcs(events: IcsEvent[], opts: IcsOptions): string {
  const stamp = formatStamp(opts.now ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//juku-hr//shift calendar//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // 取りに来る間隔の希望。守るかどうかは読み手次第で、Google は数時間〜24時間かかる
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toUtcStamp(e.date, e.startTime)}`);
    lines.push(`DTEND:${toUtcStamp(e.date, e.endTime)}`);
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // 改行は CRLF でなければならない。LF だけだと読まないアプリがある。
  return lines.map(fold).join("\r\n") + "\r\n";
}
