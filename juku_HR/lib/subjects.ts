/**
 * 講師の担当科目まわり。
 *
 * 「誰が何を教えられるか」は、これまでシフトを組む人の記憶の中にあった。
 * 自動作成が候補を絞るために使うので、ここが埋まっていないとシフトが作れない。
 *
 * 集計は Prisma に依存しない純粋関数にしてある。DB を用意せずにテストできるようにするため。
 */

import { SUBJECT_LEVEL, SUBJECT_SINGLE_POINT_MAX } from "./constants";

export type SubjectLite = { id: number; name: string };
export type TeacherLite = { id: number; name: string };
export type TeacherSubjectLite = {
  teacherId: number;
  subjectId: number;
  level: number;
};

/**
 * ボタンを押すたびに 未設定 → 可 → 得意 → 専門 → 未設定 と回す。
 *
 * 勤怠管理のコマのボタンと同じ操作にしてある。
 * 講師×科目は数が多いので、選択肢を開かせず1クリックで変えられるほうが速い。
 */
export function nextLevel(current: number | null | undefined): number {
  const now = current ?? SUBJECT_LEVEL.NONE;
  if (now >= SUBJECT_LEVEL.EXPERT) return SUBJECT_LEVEL.NONE;
  return now + 1;
}

export type SubjectCoverage = {
  subjectId: number;
  name: string;
  /** 担当できる講師の人数 */
  teacherCount: number;
  /** うち「専門」の人数 */
  expertCount: number;
  /** 誰も担当できない。この科目に需要があると自動作成が実行できない（P8） */
  uncovered: boolean;
  /** 担当できる講師が少なすぎる。休まれると授業が成立しない */
  singlePoint: boolean;
};

/**
 * 科目ごとに、担当できる講師が何人いるかを数える。
 *
 * 「英語が3コマ埋まらない」と言われたとき、原因が
 * 「出られる人がいない」のか「英語を教えられる人がいない」のかを切り分けるための材料。
 */
export function coverage(
  subjects: SubjectLite[],
  links: TeacherSubjectLite[],
): SubjectCoverage[] {
  return subjects.map((s) => {
    const mine = links.filter((l) => l.subjectId === s.id);
    const teacherCount = mine.length;
    return {
      subjectId: s.id,
      name: s.name,
      teacherCount,
      expertCount: mine.filter((l) => l.level >= SUBJECT_LEVEL.EXPERT).length,
      uncovered: teacherCount === 0,
      // 0人は uncovered として別に扱うので、ここには含めない
      singlePoint: teacherCount > 0 && teacherCount <= SUBJECT_SINGLE_POINT_MAX,
    };
  });
}

/**
 * 担当科目が1件も登録されていない講師。
 *
 * この講師は自動作成の候補に一度も上がらない。
 * 「シフトに入れてもらえない」という苦情の原因になるので、登録漏れとして名指しする。
 */
export function teachersWithoutSubject(
  teachers: TeacherLite[],
  links: TeacherSubjectLite[],
): TeacherLite[] {
  const has = new Set(links.map((l) => l.teacherId));
  return teachers.filter((t) => !has.has(t.id));
}

/** 講師×科目を引きやすくする。画面で1マスずつ引くため。 */
export function levelMap(links: TeacherSubjectLite[]): Map<string, number> {
  return new Map(links.map((l) => [`${l.teacherId}:${l.subjectId}`, l.level]));
}

export function levelOf(
  map: Map<string, number>,
  teacherId: number,
  subjectId: number,
): number {
  return map.get(`${teacherId}:${subjectId}`) ?? SUBJECT_LEVEL.NONE;
}
