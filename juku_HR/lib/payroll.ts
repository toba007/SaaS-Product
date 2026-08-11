import { prisma } from "./prisma";
import { MESSAGE_KIND, PAY_BASIS, PAY_SOURCE, usesSpotCommute } from "./constants";
import { type Ym, monthDays } from "./dates";

export type CommuteDay = {
  date: string;
  amount: number;
  /** その日が属する期の名前。期の登録が無ければ null */
  termName: string | null;
  /** 定期券が無い前提の期（講習期間）か */
  spot: boolean;
};

/** 明細の1行 */
export type PayLine = {
  itemId: number;
  name: string;
  /** PER_SLOT | PER_HOUR | PER_DAY | MONTHLY */
  basis: string;
  /** 数量。コマ数／分／日数。MONTHLY は 1 */
  quantity: number;
  /** 単価。この講師に設定されていなければ null */
  rate: number | null;
  amount: number;
};

export type Payslip = {
  teacherId: number;
  name: string;
  employment: string;

  /** 明細に並ぶ行。管理者が作った賃金項目のうち、実績があるものだけ */
  lines: PayLine[];

  /** 担当したコマ数の合計（PER_SLOT の行の合計） */
  slotCount: number;
  /** 事務作業などの合計(分)（PER_HOUR の行の合計） */
  hourMinutes: number;
  /** 日額の合計（PER_DAY の行の合計） */
  dailyPay: number;

  /** 単価が未設定のまま実績があるコマ数。0 でないと金額が正しくない */
  unratedCount: number;

  /**
   * どの賃金項目にも紐づかなかった実績。
   *
   * 授業形態は教室の設定（1対何人まで）で増える。増えた形態に対応する項目を
   * 作っていないと、その実績は明細のどの行にも入らず、**黙って無給になる。**
   * 単価未設定（0円で出る）よりたちが悪いので、別に数えて画面で知らせる。
   */
  orphanSlots: number;
  /** 上の内訳。どの授業形態が取りこぼされたか */
  orphanStyles: string[];
  /** どの項目にも入らなかった事務作業(分) */
  orphanMinutes: number;

  /** 出勤した日数 */
  workDays: number;
  commuteDays: CommuteDay[];

  /** 支給合計 */
  total: number;
};

/**
 * 1人ぶんの給与を勤怠の実績から計算する。
 *
 * 何を払うかは `PayItem`（賃金項目）で決まる。項目は管理者が作るもので、
 * 名前も数も塾ごとに違う（PDF p15「コマ給が20や30なんてこともあります」）。
 * ここは項目を1つずつ見て「数量 × 単価」を出すだけにしてある。
 *
 * 単価が入っていない項目は 0 円にせず `rate: null` で返す。黙って0円で出すと、
 * 設定漏れが「その講師は働いていない」ように見えてしまう。
 *
 * 支払い（振込）は範囲外。計算と明細まで。
 */
export async function computePayslip(
  teacherId: number,
  ym: Ym,
): Promise<Payslip | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { payRates: true },
  });
  if (!teacher) return null;

  const days = monthDays(ym);
  const from = days[0];
  const to = days[days.length - 1];

  const [items, duties, adminWorks, punches, terms] = await Promise.all([
    prisma.payItem.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { id: "asc" }],
    }),
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

  // 出勤日は「打刻がある日」と「コマを担当した日」の和集合。
  // 打刻し忘れても、コマを持っていれば来ているはずなので拾う。
  const workedDates = [
    ...new Set([...punches.map((p) => p.date), ...duties.map((d) => d.date)]),
  ].sort();

  const spotOf = (date: string) => {
    const term = terms.find((t) => date >= t.startDate && date <= t.endDate);
    // 期の登録が無い日は通常期とみなす（定期券あり前提）
    return term ? usesSpotCommute(term.kind) : false;
  };

  const rateOf = (itemId: number) =>
    teacher.payRates.find((r) => r.payItemId === itemId)?.amount ?? null;

  const lines: PayLine[] = [];
  for (const item of items) {
    const rate = rateOf(item.id);
    let quantity = 0;

    if (item.basis === PAY_BASIS.PER_SLOT) {
      // 実績が項目を指していればそれを使う。指していない古い実績は style で拾う。
      quantity = duties.filter(
        (d) =>
          d.payItemId === item.id ||
          (d.payItemId === null && item.legacyStyle === d.style),
      ).length;
    } else if (item.basis === PAY_BASIS.PER_HOUR) {
      quantity = adminWorks
        .filter(
          (a) =>
            a.payItemId === item.id ||
            (a.payItemId === null && item.source === PAY_SOURCE.ADMIN),
        )
        .reduce((n, a) => n + a.minutes, 0);
    } else if (item.basis === PAY_BASIS.PER_DAY) {
      const wantSpot = item.source === PAY_SOURCE.SPOT;
      quantity = workedDates.filter((d) => spotOf(d) === wantSpot).length;
    } else if (item.basis === PAY_BASIS.MONTHLY) {
      // 月額手当は、単価を入れた講師にだけ毎月付く
      quantity = rate === null ? 0 : 1;
    }

    if (quantity === 0) continue;
    // 単価が無く実績も無い項目は出さない。実績があるなら未設定として出す。
    if (rate === null && item.basis === PAY_BASIS.PER_DAY) continue;

    const amount =
      rate === null
        ? 0
        : item.basis === PAY_BASIS.PER_HOUR
          ? // 端数は1件ずつ丸めると誤差が積もるので、月合計の分数から1回だけ計算する
            Math.round((quantity / 60) * rate)
          : item.basis === PAY_BASIS.MONTHLY
            ? rate
            : quantity * rate;

    lines.push({
      itemId: item.id,
      name: item.name,
      basis: item.basis,
      quantity,
      rate,
      amount,
    });
  }

  const sumWhere = (basis: string, pick: (l: PayLine) => number) =>
    lines.filter((l) => l.basis === basis).reduce((n, l) => n + pick(l), 0);

  // どの項目にも拾われなかった実績を洗い出す
  const covers = (itemId: number, legacyStyle: string | null) => ({ itemId, legacyStyle });
  const slotItems = items
    .filter((i) => i.basis === PAY_BASIS.PER_SLOT)
    .map((i) => covers(i.id, i.legacyStyle));
  const orphanDuties = duties.filter(
    (d) =>
      !slotItems.some(
        (i) =>
          d.payItemId === i.itemId ||
          (d.payItemId === null && i.legacyStyle === d.style),
      ),
  );
  const hasAdminSink = items.some(
    (i) => i.basis === PAY_BASIS.PER_HOUR && i.source === PAY_SOURCE.ADMIN,
  );
  const orphanAdmin = adminWorks.filter(
    (a) =>
      !items.some((i) => i.basis === PAY_BASIS.PER_HOUR && a.payItemId === i.id) &&
      !(a.payItemId === null && hasAdminSink),
  );

  // 交通費の内訳（どの日がいくらだったか）。明細画面で日ごとに見せるために残す。
  const commuteDays: CommuteDay[] = workedDates.map((date) => {
    const spot = spotOf(date);
    const term = terms.find((t) => date >= t.startDate && date <= t.endDate);
    const item = items.find(
      (i) =>
        i.basis === PAY_BASIS.PER_DAY &&
        i.source === (spot ? PAY_SOURCE.SPOT : PAY_SOURCE.REGULAR),
    );
    return {
      date,
      amount: item ? (rateOf(item.id) ?? 0) : 0,
      termName: term?.name ?? null,
      spot,
    };
  });

  return {
    teacherId: teacher.id,
    name: teacher.name,
    employment: teacher.employment,
    lines,
    slotCount: sumWhere(PAY_BASIS.PER_SLOT, (l) => l.quantity),
    hourMinutes: sumWhere(PAY_BASIS.PER_HOUR, (l) => l.quantity),
    dailyPay: sumWhere(PAY_BASIS.PER_DAY, (l) => l.amount),
    unratedCount: lines
      .filter((l) => l.rate === null && l.basis === PAY_BASIS.PER_SLOT)
      .reduce((n, l) => n + l.quantity, 0),
    orphanSlots: orphanDuties.length,
    orphanStyles: [...new Set(orphanDuties.map((d) => d.style))].sort(),
    orphanMinutes: orphanAdmin.reduce((n, a) => n + a.minutes, 0),
    workDays: workedDates.length,
    commuteDays,
    total: lines.reduce((n, l) => n + l.amount, 0),
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

/**
 * 明細ができたことを知らせる連絡の件名。
 *
 * 送るときと「もう送ったか」を調べるときの両方で使う。
 * 件名で照合しているので、ここを書き換えると過去の通知が見つからなくなる。
 * （通知したかどうかを持つテーブルは作っていない。連絡そのものが記録なので、
 *   同じことを2箇所に持つと必ず食い違う）
 */
export function payslipNoticeTitle(ym: Ym): string {
  return `${ym.year}年${ym.month}月分の給与明細ができました`;
}

/** その月の明細を、もう知らせてあるか。まだなら null。 */
export async function payslipNoticeSentAt(ym: Ym): Promise<Date | null> {
  const hit = await prisma.message.findFirst({
    where: { title: payslipNoticeTitle(ym), kind: MESSAGE_KIND.NOTICE },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return hit?.createdAt ?? null;
}

/** 明細の1行を「12コマ × ¥3,000」のように読める形にする */
export function payLineDetail(l: PayLine): string {
  const qty =
    l.basis === PAY_BASIS.PER_HOUR
      ? formatMinutes(l.quantity)
      : l.basis === PAY_BASIS.PER_DAY
        ? `${l.quantity}日`
        : l.basis === PAY_BASIS.MONTHLY
          ? "月額"
          : `${l.quantity}コマ`;
  if (l.rate === null) return `${qty} ／ 単価が未設定です`;
  if (l.basis === PAY_BASIS.MONTHLY) return "月額";
  return `${qty} × ${yen(l.rate)}`;
}
