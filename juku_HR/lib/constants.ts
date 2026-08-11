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

/**
 * シフト計画の状態。講師に見せるのは CONFIRMED だけ。
 * 検討中のシフトが見えると、確定していない予定で人が動いてしまう。
 */
export const PLAN_STATUS = {
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
} as const;
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

export const PLAN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "下書き",
  CONFIRMED: "確定",
};

/** 割当が自動作成か手修正か。盤面で区別して表示する。 */
export const ASSIGNMENT_SOURCE = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
} as const;

export const ASSIGNMENT_SOURCE_LABEL: Record<string, string> = {
  AUTO: "自動",
  MANUAL: "手修正",
};

/**
 * 勤務上限の既定値。TeacherShiftRule が無い講師にはこれを使う。
 *
 * **仮置きの数字**。労働時間のルールや、社員と学生講師で分けるかどうかを
 * 塾に確認したうえで決め直す（要件定義 7.7 の未決定事項）。
 * schema.prisma の @default と同じ値にしておくこと。
 */
export const DEFAULT_SHIFT_RULE = {
  maxPerDay: 4,
  maxPerWeek: 12,
  maxConsecutive: 3,
  minPerWeek: 0,
} as const;

/**
 * 講師がその科目をどれだけ担当できるか（TeacherSubject.level）。
 *
 * 「誰が何を教えられるか」は、これまでシフトを組む人の記憶の中にあった。
 * 自動作成はこれを見て候補を絞るので、登録されていない科目には割り当てない。
 * 同点のときは level の高い講師を優先する。
 */
export const SUBJECT_LEVEL = {
  /** 行が無い状態。担当しない。 */
  NONE: 0,
  OK: 1,
  GOOD: 2,
  EXPERT: 3,
} as const;

export const SUBJECT_LEVEL_LABEL: Record<number, string> = {
  1: "可",
  2: "得意",
  3: "専門",
};

/** 表が狭いので記号で出す。押すたびに回る順は lib/subjects.ts の nextLevel。 */
export const SUBJECT_LEVEL_MARK: Record<number, string> = {
  1: "○",
  2: "◎",
  3: "★",
};

/**
 * 担当できる講師がこの人数以下の科目は警告を出す。
 * 1人しかいないと、その人が休んだ日に授業が成立しない。
 * 割当を止めるものではなく、採用や研修の判断材料として見せる。
 */
export const SUBJECT_SINGLE_POINT_MAX = 1;

/**
 * 集団クラスのレベル（ClassGroup.level）。
 *
 * **Ⅰ〜Ⅲ の3段階だが、必ず3クラスあるわけではない。**
 * 人数によって2クラスのことも、1クラスだけのこともある。
 * レベルは「用意された枠」ではなく、実際に立ったクラスに付くラベルとして扱う。
 * 1クラスしか無いときは Ⅰ を使う。
 */
export const CLASS_LEVEL_MAX = 3;

export const CLASS_LEVEL_LABEL: Record<number, string> = {
  1: "Ⅰ",
  2: "Ⅱ",
  3: "Ⅲ",
};

/** 1..3 以外が入っていても画面が壊れないようにする */
export function classLevelLabel(level: number): string {
  return CLASS_LEVEL_LABEL[level] ?? String(level);
}

export const TERM_KIND = {
  REGULAR: "REGULAR",
  SUMMER: "SUMMER",
  WINTER: "WINTER",
  SPRING: "SPRING",
  /// テスト対策など、通常の時間割とは別に組む授業
  SPECIAL: "SPECIAL",
} as const;

export const TERM_KIND_LABEL: Record<string, string> = {
  REGULAR: "レギュラー",
  SUMMER: "夏期講習",
  WINTER: "冬期講習",
  SPRING: "春期講習",
  SPECIAL: "特別授業",
};

/** コマの登録画面などで並べる順 */
export const TERM_KIND_ORDER: string[] = [
  TERM_KIND.REGULAR,
  TERM_KIND.SUMMER,
  TERM_KIND.WINTER,
  TERM_KIND.SPRING,
  TERM_KIND.SPECIAL,
];

/** 講習期間は定期券が無い前提。交通費の計算で使う。 */
export function usesSpotCommute(termKind: string): boolean {
  return termKind !== TERM_KIND.REGULAR;
}

/**
 * 授業形態。コマ給がこれで変わる。
 * 同じ講師でも、集団を持つ日と個別を持つ日で単価が違う。
 *
 * **個別を何人まで持てるかは塾によって違う**（1対2までの塾も、1対4まで見る塾もある）。
 * そのため形態は固定の一覧ではなく、塾の設定 `indivMaxStudents` から組み立てる。
 * 一覧が要るところでは `lessonStyles(indivMax)` を使う。
 */
export const LESSON_STYLE = {
  GROUP: "GROUP",
  INDIV_1: "INDIV_1",
  INDIV_2: "INDIV_2",
} as const;
export type LessonStyle = string;

/** 個別で同時にみる人数の、システムとして許す上限。設定画面の入力チェックに使う。 */
export const INDIV_MAX_LIMIT = 9;

/** 1対 n の形態コードを作る。 */
export function indivStyle(n: number): string {
  return `INDIV_${n}`;
}

/** 形態コードから「同時にみる人数」を取り出す。集団なら null。 */
export function indivSizeOf(style: string): number | null {
  const m = /^INDIV_(\d+)$/.exec(style);
  return m ? Number(m[1]) : null;
}

/**
 * 選べる授業形態を並び順で返す。
 * 個別の上限が4なら 集団・1対1・1対2・1対3・1対4 の5つ。
 */
export function lessonStyles(indivMax: number): string[] {
  const n = Math.max(1, Math.min(Math.trunc(indivMax) || 1, INDIV_MAX_LIMIT));
  return [
    LESSON_STYLE.GROUP,
    ...Array.from({ length: n }, (_, i) => indivStyle(i + 1)),
  ];
}

export function lessonStyleLabel(style: string): string {
  if (style === LESSON_STYLE.GROUP) return "集団";
  const n = indivSizeOf(style);
  return n === null ? style : `個別 1対${n}`;
}

/** 表が狭いところ用の短い名前 */
export function lessonStyleShort(style: string): string {
  if (style === LESSON_STYLE.GROUP) return "集団";
  const n = indivSizeOf(style);
  return n === null ? style : `1対${n}`;
}

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

/**
 * 賃金項目の計算方法。項目そのものは管理者が作るので、決め打ちなのは
 * 「何に掛けるか」だけにしてある。
 */
export const PAY_BASIS = {
  /** コマ数 × 単価 */
  PER_SLOT: "PER_SLOT",
  /** 時間 × 単価（分で持ち、月合計から1回だけ丸める） */
  PER_HOUR: "PER_HOUR",
  /** 出勤日数 × 単価 */
  PER_DAY: "PER_DAY",
  /** 月額固定 */
  MONTHLY: "MONTHLY",
} as const;
export type PayBasis = (typeof PAY_BASIS)[keyof typeof PAY_BASIS];

export const PAY_BASIS_ORDER: string[] = [
  PAY_BASIS.PER_SLOT,
  PAY_BASIS.PER_HOUR,
  PAY_BASIS.PER_DAY,
  PAY_BASIS.MONTHLY,
];

export const PAY_BASIS_LABEL: Record<string, string> = {
  PER_SLOT: "コマ数 × 単価",
  PER_HOUR: "時間 × 単価",
  PER_DAY: "出勤日数 × 単価",
  MONTHLY: "月額固定",
};

/** 単価の見出し（1コマ／1時間／1日／月額） */
export const PAY_BASIS_UNIT: Record<string, string> = {
  PER_SLOT: "1コマ",
  PER_HOUR: "1時間",
  PER_DAY: "1日",
  MONTHLY: "月額",
};

/**
 * 数量の取り方。PER_DAY だけは「どちらの期間の出勤日か」を選ぶ必要がある。
 * PER_SLOT / PER_HOUR は実績側が項目を指すので、空でよい。
 */
export const PAY_SOURCE = {
  /** 定期券のある通常期の出勤日 */
  REGULAR: "REGULAR",
  /** 定期券のない講習期間の出勤日 */
  SPOT: "SPOT",
  /** 項目を指していない事務作業の受け皿 */
  ADMIN: "ADMIN",
} as const;

export const PAY_SOURCE_LABEL: Record<string, string> = {
  REGULAR: "通常期（定期券あり）の出勤日",
  SPOT: "講習期間（定期券なし）の出勤日",
  ADMIN: "項目を選んでいない事務作業",
};

/** その日のやりとり1件の本文の上限。備考のつもりの欄なので長文は想定しない。 */
export const COMMENT_BODY_MAX = 1000;

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

/**
 * 学年帯。**コマの時間割はこの単位で変わる。**
 *
 * 小学生は学校が早く終わるので17:40から40分、中学生は部活の後なので19:15から50分、
 * のように下校時刻と集中力に合わせて別の時間割を組む塾が多い。
 * 一方で学年で分けない塾もあるので、その場合は ALL だけを使う。
 */
export const GRADE_BAND = {
  ALL: "ALL",
  ELEM: "ELEM",
  JUNIOR: "JUNIOR",
  HIGH: "HIGH",
} as const;
export type GradeBand = (typeof GRADE_BAND)[keyof typeof GRADE_BAND];

export const GRADE_BAND_LABEL: Record<string, string> = {
  ALL: "全学年",
  ELEM: "小学生",
  JUNIOR: "中学生",
  HIGH: "高校生",
};

/** 表が狭いところ用 */
export const GRADE_BAND_SHORT: Record<string, string> = {
  ALL: "全",
  ELEM: "小",
  JUNIOR: "中",
  HIGH: "高",
};

/** 画面に並べる順 */
export const GRADE_BAND_ORDER: string[] = [
  GRADE_BAND.ALL,
  GRADE_BAND.ELEM,
  GRADE_BAND.JUNIOR,
  GRADE_BAND.HIGH,
];

/** "中2" → JUNIOR。GRADES 以外の文字列が来たら ALL 扱いにする。 */
export function bandOfGrade(grade: string): string {
  if (grade.startsWith("小")) return GRADE_BAND.ELEM;
  if (grade.startsWith("中")) return GRADE_BAND.JUNIOR;
  if (grade.startsWith("高")) return GRADE_BAND.HIGH;
  return GRADE_BAND.ALL;
}

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
