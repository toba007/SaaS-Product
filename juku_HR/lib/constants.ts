// SQLite は enum 非対応なので、区分値はここに集約する。

export const FORMAT = {
  GROUP: "GROUP",
  INDIVIDUAL: "INDIVIDUAL",
} as const;
export type Format = (typeof FORMAT)[keyof typeof FORMAT];

export const FORMAT_LABEL: Record<string, string> = {
  GROUP: "集団",
  INDIVIDUAL: "個別",
};

export const ATTENDANCE = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  MAKEUP: "MAKEUP",
} as const;
export type AttendanceStatus = (typeof ATTENDANCE)[keyof typeof ATTENDANCE];

export const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: "出席",
  ABSENT: "欠席",
  LATE: "遅刻",
  MAKEUP: "振替",
};

/// カードを作る必要がある出欠区分
export const NEEDS_CARD: string[] = [ATTENDANCE.ABSENT];

export const CARD_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  DELIVERED: "DELIVERED",
} as const;
export type CardStatus = (typeof CARD_STATUS)[keyof typeof CARD_STATUS];

export const CARD_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  READY: "渡せる",
  DELIVERED: "受渡済",
};

export const EMPLOYMENT = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  STUDENT: "STUDENT",
} as const;

export const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "社員",
  PART_TIME: "時間講師",
  STUDENT: "学生講師",
};

/** シフト希望の状態 */
export const SHIFT = {
  OK: "OK",
  PREFER: "PREFER",
  NG: "NG",
} as const;
export type ShiftStatus = (typeof SHIFT)[keyof typeof SHIFT];

export const SHIFT_LABEL: Record<string, string> = {
  OK: "出られる",
  PREFER: "できれば入りたい",
  NG: "出られない",
};

/** カレンダーのセルに出す短い記号 */
export const SHIFT_MARK: Record<string, string> = {
  OK: "○",
  PREFER: "◎",
  NG: "×",
};

export const TERM_KIND = {
  REGULAR: "REGULAR",
  SUMMER: "SUMMER",
  WINTER: "WINTER",
  SPRING: "SPRING",
} as const;

export const TERM_KIND_LABEL: Record<string, string> = {
  REGULAR: "レギュラー",
  SUMMER: "夏期講習",
  WINTER: "冬期講習",
  SPRING: "春期講習",
};

/** 講習期間は定期券が無い前提。交通費の計算で使う。 */
export function usesSpotCommute(termKind: string): boolean {
  return termKind !== TERM_KIND.REGULAR;
}

/**
 * 授業形態。コマ給がこれで変わる。
 * 同じ講師でも、集団を持つ日と個別を持つ日で単価が違う。
 */
export const LESSON_STYLE = {
  GROUP: "GROUP",
  INDIV_1: "INDIV_1",
  INDIV_2: "INDIV_2",
} as const;
export type LessonStyle = (typeof LESSON_STYLE)[keyof typeof LESSON_STYLE];

/** 給与設定・勤怠の画面に出す順 */
export const LESSON_STYLE_ORDER: string[] = [
  LESSON_STYLE.GROUP,
  LESSON_STYLE.INDIV_1,
  LESSON_STYLE.INDIV_2,
];

export const LESSON_STYLE_LABEL: Record<string, string> = {
  GROUP: "集団",
  INDIV_1: "個別 1対1",
  INDIV_2: "個別 1対2",
};

/** 表が狭いところ用の短い名前 */
export const LESSON_STYLE_SHORT: Record<string, string> = {
  GROUP: "集団",
  INDIV_1: "1対1",
  INDIV_2: "1対2",
};

/** 塾の予定の種別 */
export const EVENT_KIND = {
  CLOSED: "CLOSED",
  EVENT: "EVENT",
} as const;

export const EVENT_KIND_LABEL: Record<string, string> = {
  CLOSED: "休校日",
  EVENT: "行事",
};

/** ログインした人の役割。管理者も講師も Teacher レコードに役割を持つ。 */
export const ROLE = { ADMIN: "ADMIN", TEACHER: "TEACHER" } as const;

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "管理者",
  TEACHER: "講師",
};

/** ログイン後に行く先。管理者は管理者画面、講師は講師画面。 */
export function homeFor(role: string): string {
  return role === ROLE.ADMIN ? "/" : "/t";
}

export const MESSAGE_KIND = {
  NOTICE: "NOTICE",
  SURVEY: "SURVEY",
} as const;

export const MESSAGE_KIND_LABEL: Record<string, string> = {
  NOTICE: "連絡",
  SURVEY: "アンケート",
};

export const GRADES = [
  "小1", "小2", "小3", "小4", "小5", "小6",
  "中1", "中2", "中3",
  "高1", "高2", "高3",
] as const;

/** "YYYY-MM-DD" を返す（ローカル時刻基準。UTC変換を挟まない） */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "2026-07-15" -> "7/15(水)" */
export function formatDateJP(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(y, m - 1, d).getDay()
  ];
  return `${m}/${d}(${wd})`;
}
