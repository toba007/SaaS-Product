import { prisma } from "./prisma";
import { buildIcs, type IcsEvent } from "./ics";
import { pseudonym } from "./ai/anonymize";
import { FORMAT_LABEL, PLAN_STATUS, todayISO } from "./constants";
import { shiftDays } from "./dates";

/**
 * 講師個人のカレンダー購読フィードを作る。
 *
 * 中身は「コマ単位で1件」。出勤確定と担当授業を別々の予定にすると、同じ時間帯に
 * 2件並んで見えて紛らわしいので、同じコマのものは1件にまとめる。
 *
 * 生徒の実名は載せない。このフィードは講師の私物のGoogleアカウントに流れ、
 * 塾の管理外に出る。URLが漏れれば誰でも読めるので、外に出す前提で中身を決める。
 * （lib/ai/anonymize.ts の pseudonym と同じ「生徒003」表記を使う）
 */

/** 過去に遡る日数。前月ぶんの給与確認に使うので1か月ぶん残す。 */
const PAST_DAYS = 31;
/** 先まで出す日数。無限に出すとフィードが重くなるだけで誰も見ない。 */
const FUTURE_DAYS = 183;

export type Feed = { calendarName: string; ics: string };

/** 購読トークンからフィードを作る。トークンが合わなければ null。 */
export async function feedForToken(
  token: string,
  now: Date = new Date(),
): Promise<Feed | null> {
  const teacher = await prisma.teacher.findFirst({
    where: { icsToken: token, active: true },
    select: { id: true, name: true },
  });
  // 退職した講師のURLは、その時点で読めなくなる
  if (!teacher) return null;

  const today = todayISO(now);
  const from = shiftDays(today, -PAST_DAYS);
  const to = shiftDays(today, FUTURE_DAYS);

  const [assignments, lessons] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: {
        teacherId: teacher.id,
        date: { gte: from, lte: to },
        // 画面と同じ条件。検討中の割当を私物のカレンダーに流したら取り消せない。
        OR: [{ planId: null }, { plan: { status: PLAN_STATUS.CONFIRMED } }],
      },
      include: { period: true },
    }),
    prisma.lesson.findMany({
      where: { teacherId: teacher.id, date: { gte: from, lte: to } },
      include: {
        period: true,
        subject: true,
        room: true,
        attendances: { select: { studentId: true } },
      },
    }),
  ]);

  return {
    calendarName: `塾HR ${teacher.name}`,
    ics: buildIcs(toEvents(assignments, lessons), {
      calendarName: `塾HR ${teacher.name}`,
      now,
    }),
  };
}

type AssignmentRow = {
  date: string;
  periodId: number;
  format: string | null;
  period: { name: string; startTime: string; endTime: string };
};

type LessonRow = {
  date: string;
  periodId: number;
  format: string;
  title: string;
  period: { name: string; startTime: string; endTime: string };
  subject: { name: string };
  room: { name: string };
  attendances: { studentId: number }[];
};

/**
 * 出勤と授業を「日付×コマ」で1件にまとめる。
 * 出力が並び順に依存しないよう、日付とコマで並べ替えてから返す。
 */
export function toEvents(
  assignments: AssignmentRow[],
  lessons: LessonRow[],
): IcsEvent[] {
  const keys = new Map<
    string,
    { date: string; periodId: number; period: AssignmentRow["period"] }
  >();
  for (const a of assignments) {
    keys.set(`${a.date}:${a.periodId}`, {
      date: a.date,
      periodId: a.periodId,
      period: a.period,
    });
  }
  for (const l of lessons) {
    keys.set(`${l.date}:${l.periodId}`, {
      date: l.date,
      periodId: l.periodId,
      period: l.period,
    });
  }

  const events: IcsEvent[] = [];
  for (const [key, k] of [...keys].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const here = lessons.filter(
      (l) => l.date === k.date && l.periodId === k.periodId,
    );
    const assigned = assignments.some(
      (a) => a.date === k.date && a.periodId === k.periodId,
    );

    const subjects = [...new Set(here.map((l) => l.subject.name))];
    const summary =
      subjects.length === 0
        ? `塾 出勤（${k.period.name}）`
        : `塾 ${subjects.join("・")}（${k.period.name}）`;

    const detail: string[] = [];
    for (const l of here) {
      const students = l.attendances
        .map((a) => pseudonym(a.studentId))
        .sort()
        .join("、");
      detail.push(
        [
          l.subject.name,
          FORMAT_LABEL[l.format] ?? l.format,
          l.room.name,
          l.title,
          students,
        ]
          .filter(Boolean)
          .join(" / "),
      );
    }
    // 授業だけ入っていて出勤が確定していないコマは、当日になって気づくと困る
    if (!assigned) detail.push("※ 出勤はまだ確定していません");

    events.push({
      // 割当の行が作り直されてもズレないよう、行のidではなく日付とコマで決める
      uid: `${key.replace(":", "-")}@juku-hr`,
      date: k.date,
      startTime: k.period.startTime,
      endTime: k.period.endTime,
      summary,
      description: detail.join("\n") || undefined,
      location: here[0]?.room.name,
    });
  }

  return events;
}
