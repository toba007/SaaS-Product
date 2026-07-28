import { prisma } from "./prisma";
import { LESSON_STYLE_ORDER, usesSpotCommute } from "./constants";
import { type Ym, monthDays } from "./dates";

export type CommuteDay = {
  date: string;
  amount: number;
  /** その日が属する期の名前。期の登録が無ければ null */
  termName: string | null;
  /** 定期券が無い前提の期（講習期間）か */
  spot: boolean;
};

/** 授業形態ごとのコマ給の内訳 */
export type StyleLine = {
  style: string;
  count: number;
  /** 1コマあたりの単価。設定されていなければ null */
  rate: number | null;
  amount: number;
};

export type Payslip = {
  teacherId: number;
  name: string;
  employment: string;

  /** 担当したコマ数（形態を問わない合計） */
  lessonCount: number;
  /** 授業形態ごとの内訳 */
  styleLines: StyleLine[];
  /** コマ給の合計 */
  lessonPay: number;
  /** 単価が未設定の形態で担当したコマ数。0 でないと金額が正しくない */
  unratedCount: number;

  /** 事務作業の合計(分) */
  adminMinutes: number;
  hourlyWage: number;
  /** 事務作業ぶんの時給合計 */
  adminPay: number;

  /** 出勤した日数 */
  workDays: number;
  commuteDays: CommuteDay[];
  /** 交通費の合計 */
  commutePay: number;

  /** 支給合計 */
  total: number;
};

/**
 * 1人ぶんの給与を勤怠の実績から計算する。
 *
 * 塾の給与形態にあわせて、次の3つを足す（PDF の「時給＆コマ給」「交通費計算もラクラク」に対応）。
 *   - コマ給: 担当したコマ数 × 単価。単価は授業形態（集団／個別1対1／1対2）ごとに違う
 *   - 時給:   事務作業の時間 × 時給
 *   - 交通費: 出勤した日ごとに支給。定期券のある通常期と、定期券の無い講習期間で単価が変わる
 *
 * 支払い（振込）は範囲外。計算と明細まで。
 */
export async function computePayslip(
  teacherId: number,
  ym: Ym,
): Promise<Payslip | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { wageRates: true },
  });
  if (!teacher) return null;

  const days = monthDays(ym);
  const from = days[0];
  const to = days[days.length - 1];

  const [duties, adminWorks, punches, terms] = await Promise.all([
    prisma.dutyRecord.findMany({
      where: { teacherId, date: { gte: from, lte: to } },
    }),
    prisma.adminWork.findMany({
      where: { teacherId, date: { gte: from, lte: to } },
    }),
    prisma.punch.findMany({
      where: { teacherId, date: { gte: from, lte: to } },
    }),
    prisma.term.findMany(),
  ]);

  // 授業形態ごとに数えて単価を掛ける。
  // 単価が未設定の形態は 0 円にはせず null にして、画面で気づけるようにする。
  // 黙って0円で出すと、設定漏れが「その講師は働いていない」ように見えてしまう。
  const styleLines: StyleLine[] = LESSON_STYLE_ORDER.map((style) => {
    const count = duties.filter((d) => d.style === style).length;
    const rate = teacher.wageRates.find((r) => r.style === style)?.amount ?? null;
    return { style, count, rate, amount: count * (rate ?? 0) };
  }).filter((l) => l.count > 0);

  const lessonCount = duties.length;
  const lessonPay = styleLines.reduce((s, l) => s + l.amount, 0);
  const unratedCount = styleLines
    .filter((l) => l.rate === null)
    .reduce((s, l) => s + l.count, 0);

  // 端数の扱い: 1件ずつ丸めると誤差が積もるので、月合計の分数から1回だけ計算する
  const adminMinutes = adminWorks.reduce((s, a) => s + a.minutes, 0);
  const adminPay = Math.round((adminMinutes / 60) * teacher.hourlyWage);

  // 出勤日は「打刻がある日」と「コマを担当した日」の和集合。
  // 打刻し忘れても、コマを持っていれば来ているはずなので拾う。
  const workedDates = [
    ...new Set([...punches.map((p) => p.date), ...duties.map((d) => d.date)]),
  ].sort();

  const commuteDays: CommuteDay[] = workedDates.map((date) => {
    const term = terms.find((t) => date >= t.startDate && date <= t.endDate);
    // 期の登録が無い日は通常期とみなす（定期券あり前提）
    const spot = term ? usesSpotCommute(term.kind) : false;
    return {
      date,
      amount: spot ? teacher.commuteSpot : teacher.commuteRegular,
      termName: term?.name ?? null,
      spot,
    };
  });
  const commutePay = commuteDays.reduce((s, d) => s + d.amount, 0);

  return {
    teacherId: teacher.id,
    name: teacher.name,
    employment: teacher.employment,
    lessonCount,
    styleLines,
    lessonPay,
    unratedCount,
    adminMinutes,
    hourlyWage: teacher.hourlyWage,
    adminPay,
    workDays: workedDates.length,
    commuteDays,
    commutePay,
    total: lessonPay + adminPay + commutePay,
  };
}

/** 全講師ぶんの給与を計算する */
export async function computeAllPayslips(ym: Ym): Promise<Payslip[]> {
  const teachers = await prisma.teacher.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  const slips = await Promise.all(teachers.map((t) => computePayslip(t.id, ym)));
  return slips.filter((s): s is Payslip => s !== null);
}

/** 分を "1時間30分" のように読める形にする */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

export function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
