/**
 * 集団クラスの編成まわり。
 *
 * ---- 集団と個別で「時間割の単位」が違う ----
 * 集団はクラスが単位。学年×科目×レベルでクラスが立ち、そこに曜日・コマ・講師が付く。
 * **生徒が5人でも20人でも講師は1人**なので、必要人数は「開講クラス数」で決まる。
 * 個別は生徒が単位。必要人数は ceil(生徒数 ÷ 定員) で決まる。
 * 同じ「5人」でも必要な講師数がまったく違う。
 *
 * ---- 振り分けは人が決める ----
 * 誰をどのレベルに入れるかは、本人の希望・保護者との相談・性格の相性が絡む判断で、
 * 成績だけで機械的には決まらない。システムは記録するだけにする。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

import { LESSON_STYLE } from "./constants";
import { dayOfWeek } from "./dates";

export type StudentLite = { id: number; name: string; grade: string };
export type StudentSubjectLite = {
  studentId: number;
  subjectId: number;
  format: string;
  active: boolean;
};
export type ClassGroupLite = {
  id: number;
  name: string;
  grade: string;
  subjectId: number;
  level: number;
  capacity: number;
  fromDate: string;
  toDate: string;
};

/**
 * クラスの時間割。1つのクラスが同じ日に何コマも入る。
 * 「月曜は中1Ⅰが英英数」のような組み方をするため、クラスとは別に持つ。
 */
export type SessionLite = {
  classGroupId: number;
  dayOfWeek: number;
  periodId: number;
};

export type EnrollmentLite = { classGroupId: number; studentId: number };

/** その日にこのコマの授業があるか（曜日が一致し、クラスの有効期間内） */
export function meetsOn(
  cls: ClassGroupLite,
  session: SessionLite,
  date: string,
): boolean {
  if (session.classGroupId !== cls.id) return false;
  if (date < cls.fromDate || date > cls.toDate) return false;
  return dayOfWeek(date) === session.dayOfWeek;
}

/** 期間内で有効なクラスだけに絞る（組み直しで終了したクラスを除く） */
export function activeClasses(
  classes: ClassGroupLite[],
  from: string,
  to: string,
): ClassGroupLite[] {
  // 期間が少しでも重なるもの
  return classes.filter((c) => c.toDate >= from && c.fromDate <= to);
}

/**
 * 集団の必要講師数。
 *
 * その日そのコマに開講しているクラスの数がそのまま必要人数になる。
 * 1クラス＝講師1人なので、在籍人数は関係しない（定員チェックには使う）。
 */
export type GroupDemand = {
  date: string;
  periodId: number;
  subjectId: number;
  required: number;
};

export function groupDemand(
  classes: ClassGroupLite[],
  sessions: SessionLite[],
  dates: string[],
): GroupDemand[] {
  const acc = new Map<string, GroupDemand>();
  const byId = new Map(classes.map((c) => [c.id, c]));

  for (const date of dates) {
    for (const s of sessions) {
      const c = byId.get(s.classGroupId);
      if (!c || !meetsOn(c, s, date)) continue;
      const key = `${date}:${s.periodId}:${c.subjectId}`;
      const cur = acc.get(key);
      if (cur) cur.required++;
      else
        acc.set(key, {
          date,
          periodId: s.periodId,
          subjectId: c.subjectId,
          required: 1,
        });
    }
  }

  return [...acc.values()].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      a.periodId - b.periodId ||
      a.subjectId - b.subjectId,
  );
}

/**
 * まだクラスに入っていない生徒を探す。
 *
 * 「集団で英語を取っているのに、英語のクラスに1つも入っていない」生徒。
 * 振り分け漏れがあると、その生徒は授業に出られないまま気づかれない。
 */
export type Unassigned = {
  student: StudentLite;
  subjectId: number;
};

export function unassignedStudents(
  students: StudentLite[],
  studentSubjects: StudentSubjectLite[],
  classes: ClassGroupLite[],
  enrollments: EnrollmentLite[],
): Unassigned[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const classById = new Map(classes.map((c) => [c.id, c]));

  // 生徒がどの科目のクラスに入っているか
  const enrolledSubjects = new Map<number, Set<number>>();
  for (const e of enrollments) {
    const c = classById.get(e.classGroupId);
    if (!c) continue;
    const set = enrolledSubjects.get(e.studentId) ?? new Set<number>();
    set.add(c.subjectId);
    enrolledSubjects.set(e.studentId, set);
  }

  const out: Unassigned[] = [];
  for (const ss of studentSubjects) {
    // 集団だけが対象。個別はクラスに入らない。
    if (ss.format !== LESSON_STYLE.GROUP || !ss.active) continue;
    const student = byId.get(ss.studentId);
    if (!student) continue;
    if (enrolledSubjects.get(ss.studentId)?.has(ss.subjectId)) continue;
    out.push({ student, subjectId: ss.subjectId });
  }

  return out.sort((a, b) => a.subjectId - b.subjectId || a.student.id - b.student.id);
}

/**
 * 同じ科目で複数のクラスに入っている生徒。
 *
 * 学年が上がったときの入れ直しで、古いクラスから外し忘れると起きる。
 * その生徒は同じ時間に2つの授業に出ることになるので、気づけるようにする。
 */
export function duplicateEnrollments(
  classes: ClassGroupLite[],
  enrollments: EnrollmentLite[],
): { studentId: number; subjectId: number; classIds: number[] }[] {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const acc = new Map<string, number[]>();

  for (const e of enrollments) {
    const c = classById.get(e.classGroupId);
    if (!c) continue;
    const key = `${e.studentId}:${c.subjectId}`;
    acc.set(key, [...(acc.get(key) ?? []), c.id]);
  }

  return [...acc.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, classIds]) => {
      const [studentId, subjectId] = key.split(":").map(Number);
      return { studentId, subjectId, classIds: classIds.sort((a, b) => a - b) };
    })
    .sort((a, b) => a.studentId - b.studentId);
}

/** 定員を超えているクラス。保存は止めないが、画面で知らせる。 */
export function overCapacity(
  classes: ClassGroupLite[],
  enrollments: EnrollmentLite[],
): { cls: ClassGroupLite; count: number }[] {
  const counts = new Map<number, number>();
  for (const e of enrollments) {
    counts.set(e.classGroupId, (counts.get(e.classGroupId) ?? 0) + 1);
  }
  return classes
    .filter((c) => c.capacity > 0 && (counts.get(c.id) ?? 0) > c.capacity)
    .map((c) => ({ cls: c, count: counts.get(c.id) ?? 0 }));
}

/** クラスの在籍人数 */
export function memberCount(
  classId: number,
  enrollments: EnrollmentLite[],
): number {
  return enrollments.filter((e) => e.classGroupId === classId).length;
}
