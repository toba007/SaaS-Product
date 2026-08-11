import { prisma } from "./prisma";
import { FORMAT, LESSON_STYLE, indivStyle, lessonStyles, todayISO } from "./constants";
import { getSetting } from "./settings";

/** "HH:MM" を返す */
export function nowHM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "HH:MM" を分に直す */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** 打刻1本の勤務時間(分)。退勤前は 0。日をまたぐ想定はしない（塾は22時台まで） */
export function punchMinutes(inAt: string, outAt: string | null): number {
  if (!outAt) return 0;
  return Math.max(0, hmToMinutes(outAt) - hmToMinutes(inAt));
}

/**
 * 出勤中の打刻（退勤していないもの）を返す。
 * 1日に複数回の出退勤があるので、「その日の最後の未退勤」を見る。
 */
export async function openPunch(teacherId: number, date: string) {
  return prisma.punch.findFirst({
    where: { teacherId, date, outAt: null },
    orderBy: { inAt: "desc" },
  });
}

/**
 * 打刻する。出勤中なら退勤、そうでなければ出勤。
 * 二次元コードを読むたびにこれが呼ばれる想定なので、
 * 講師は「出勤」「退勤」を選ぶ必要がない。
 */
export async function punch(
  teacherId: number,
  date: string = todayISO(),
  at: string = nowHM(),
): Promise<"IN" | "OUT"> {
  const open = await openPunch(teacherId, date);
  if (open) {
    await prisma.punch.update({ where: { id: open.id }, data: { outAt: at } });
    return "OUT";
  }
  await prisma.punch.create({ data: { teacherId, date, inAt: at } });
  return "IN";
}

/**
 * その日担当したコマの実績を切り替える。
 * コマ給は授業形態で変わるので、押すたびに 未担当 → 集団 → 1対1 → 1対2 → 未担当 と回す。
 * ボタン1つで形態まで入るので、勤怠の入力が増えない。
 */
export async function cycleDuty(
  teacherId: number,
  date: string,
  periodId: number,
) {
  const key = { teacherId_date_periodId: { teacherId, date, periodId } };
  // 回す順は塾の設定で決まる。個別が1対4までの塾なら 集団→1対1→…→1対4→未担当。
  const order = lessonStyles((await getSetting()).indivMaxStudents);
  const existing = await prisma.dutyRecord.findUnique({ where: key });

  if (!existing) {
    await prisma.dutyRecord.create({
      data: { teacherId, date, periodId, style: order[0] },
    });
    return;
  }

  const next = order[order.indexOf(existing.style) + 1];
  if (!next) {
    // 最後まで回したら未担当に戻す
    await prisma.dutyRecord.delete({ where: key });
    return;
  }
  await prisma.dutyRecord.update({ where: key, data: { style: next } });
}

/** 授業形態を直に指定して実績を付ける／外す */
export async function setDuty(
  teacherId: number,
  date: string,
  periodId: number,
  style: string | null,
) {
  const key = { teacherId_date_periodId: { teacherId, date, periodId } };
  if (style === null) {
    await prisma.dutyRecord.deleteMany({ where: { teacherId, date, periodId } });
    return;
  }
  const allowed = lessonStyles((await getSetting()).indivMaxStudents);
  if (!allowed.includes(style)) return;
  await prisma.dutyRecord.upsert({
    where: key,
    create: { teacherId, date, periodId, style },
    update: { style },
  });
}

/**
 * 確定シフト（予定）を、その日の勤怠実績（コマ担当）に写す。
 * 予定どおり出た日はこれ一発で済む。当日の交代があれば実績側だけ直す。
 */
export async function copyAssignmentsToDuties(date: string): Promise<number> {
  const [assignments, duties, lessons, setting] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { date } }),
    prisma.dutyRecord.findMany({ where: { date } }),
    // 時間割が組んであれば、そこから授業形態を引き継ぐ
    prisma.lesson.findMany({
      where: { date },
      include: { _count: { select: { attendances: true } } },
    }),
    getSetting(),
  ]);

  const missing = assignments.filter(
    (a) =>
      !duties.some((d) => d.teacherId === a.teacherId && d.periodId === a.periodId),
  );
  if (missing.length === 0) return 0;

  await prisma.dutyRecord.createMany({
    data: missing.map((a) => {
      const lesson = lessons.find(
        (l) => l.teacherId === a.teacherId && l.periodId === a.periodId,
      );
      return { teacherId: a.teacherId, date, periodId: a.periodId, style: styleOf(lesson, setting.indivMaxStudents) };
    }),
  });
  return missing.length;
}

/**
 * 授業から給与計算用の形態を決める。
 * 個別は同時にみた生徒の数で単価が変わるので、出席人数で分ける。
 * 塾の上限（1対4までなど）を超える数が付いていても、上限までに丸める。
 * 授業が無ければ集団とみなす（勤怠の画面で直せる）。
 */
function styleOf(
  lesson: { format: string; _count: { attendances: number } } | undefined,
  indivMax: number,
): string {
  if (!lesson) return LESSON_STYLE.GROUP;
  if (lesson.format !== FORMAT.INDIVIDUAL) return LESSON_STYLE.GROUP;
  const n = Math.min(Math.max(lesson._count.attendances, 1), indivMax);
  return indivStyle(n);
}
