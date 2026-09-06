/**
 * 検証スクリプト共通の DB 初期化。
 *
 * 以前は各スクリプトが自前で全テーブルを列挙していたが、
 * **テーブルを1つ足すたびに全スクリプトを直す必要があり、必ずどれかが漏れる。**
 * 実際、ShiftDemand を足したときに verify-shifts.ts の reset が古いままで、
 * 外部キー制約違反で検証チェーン全体が止まった。
 *
 * ここ1か所を直せば済むようにする。
 * **モデルを追加したら、この配列に足すこと。**
 */
import { prisma } from "../lib/prisma";

/**
 * 消す順番。子（参照する側）から先に消す。
 * SQLite の外部キー制約があるので、順番を間違えると P2003 で落ちる。
 */
export async function resetAll() {
  // 授業まわり
  await prisma.absenceCard.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.lessonRecord.deleteMany();
  await prisma.lesson.deleteMany();

  // 勤怠
  await prisma.dutyRecord.deleteMany();
  await prisma.punch.deleteMany();
  await prisma.adminWork.deleteMany();

  // 連絡
  await prisma.messageRecipient.deleteMany();
  await prisma.message.deleteMany();
  await prisma.shiftComment.deleteMany();

  // 開講時間割（配置 → 実行 の順）。
  // **配置は Period を直接参照している**ので、コマより先に消す必要がある。
  await prisma.timetablePlacement.deleteMany();
  await prisma.timetableRun.deleteMany();

  // クラス編成と個別の受講予定。どちらも Period を参照している。
  await prisma.classEnrollment.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.classGroup.deleteMany();
  await prisma.studentSchedule.deleteMany();
  await prisma.studentSubject.deleteMany();

  // シフト（割当 → 需要 → 計画 の順。割当と需要が計画を参照している）
  await prisma.shiftAssignment.deleteMany();
  await prisma.shiftDemand.deleteMany();
  await prisma.shiftPlan.deleteMany();
  await prisma.teacherShiftRule.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.term.deleteMany();
  await prisma.schoolEvent.deleteMany();

  // 賃金項目（実績と単価から先に消す）
  await prisma.teacherPayRate.deleteMany();
  await prisma.payItem.deleteMany();

  // マスタ
  await prisma.wageRate.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.room.deleteMany();
  await prisma.period.deleteMany();
  await prisma.subject.deleteMany();

  // 塾ごとの設定（1行だけ）。seed が作り直すので、ここで消しておく。
  // 残っていると「何度流しても同じ状態になる」が崩れる。
  await prisma.schoolSetting.deleteMany();
}
