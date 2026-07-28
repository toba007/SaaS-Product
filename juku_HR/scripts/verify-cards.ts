/**
 * 欠席者カードの中核ロジックを、実際の運用の流れどおりに動かして確かめる。
 *   DATABASE_URL="file:./test.db" npx prisma migrate deploy
 *   DATABASE_URL="file:./test.db" npx tsx scripts/verify-cards.ts
 */
import { prisma } from "../lib/prisma";
import { saveRecord, setAttendanceStatus, syncCardsForLesson } from "../lib/cards";
import { ATTENDANCE, CARD_STATUS } from "../lib/constants";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}` +
      (ok ? "" : `\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`),
  );
}

async function reset() {
  await prisma.absenceCard.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.lessonRecord.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.room.deleteMany();
  await prisma.period.deleteMany();
  await prisma.subject.deleteMany();
}

async function main() {
  await reset();

  const subject = await prisma.subject.create({ data: { name: "数学" } });
  const period = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20" },
  });
  const room = await prisma.room.create({
    data: { name: "集団教室A", format: "GROUP", capacity: 20 },
  });
  const teacher = await prisma.teacher.create({
    data: { name: "佐藤 健一", loginId: "sato", passwordHash: "x" },
  });
  const [a, b, c] = await Promise.all(
    ["青木 太郎", "石川 花子", "上野 健太"].map((name) =>
      prisma.student.create({ data: { name, grade: "中3" } }),
    ),
  );

  const lesson = await prisma.lesson.create({
    data: {
      date: "2026-07-15",
      format: "GROUP",
      title: "中3 数学αクラス",
      periodId: period.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      roomId: room.id,
      attendances: {
        create: [a, b, c].map((s) => ({ studentId: s.id, status: ATTENDANCE.PRESENT })),
      },
    },
  });

  const cards = () =>
    prisma.absenceCard.findMany({ where: { lessonId: lesson.id }, orderBy: { studentId: "asc" } });

  console.log("\n[1] 全員出席ならカードは作られない");
  await syncCardsForLesson(lesson.id);
  check("カード枚数", (await cards()).length, 0);

  console.log("\n[2] 欠席にするとカードが自動で作られる");
  await setAttendanceStatus(lesson.id, a.id, ATTENDANCE.ABSENT);
  await setAttendanceStatus(lesson.id, b.id, ATTENDANCE.ABSENT);
  check("カード枚数", (await cards()).length, 2);
  check("担当講師が入る", (await cards())[0].teacherId, teacher.id);

  console.log("\n[3] 授業記録を1回書くと、欠席者全員のカードに入る");
  await saveRecord(lesson.id, {
    progress: "二次方程式の解の公式 p.42-45",
    homework: "ワークp.20-21",
    note: "",
  });
  check(
    "進んだ内容",
    (await cards()).map((x) => x.progress),
    ["二次方程式の解の公式 p.42-45", "二次方程式の解の公式 p.42-45"],
  );
  check(
    "宿題",
    (await cards()).map((x) => x.homework),
    ["ワークp.20-21", "ワークp.20-21"],
  );

  console.log("\n[4] カードを手直ししてから授業記録を直しても、手直しは消えない");
  const cardA = (await cards())[0];
  await prisma.absenceCard.update({
    where: { id: cardA.id },
    data: { progress: "青木くんは前半のみ p.42-43" },
  });
  await saveRecord(lesson.id, {
    progress: "二次方程式の解の公式 p.42-46（訂正）",
    homework: "ワークp.20-22（訂正）",
    note: "",
  });
  const after = await cards();
  check("手直ししたカードの進んだ内容は据え置き", after[0].progress, "青木くんは前半のみ p.42-43");
  check("手直ししていない宿題は追従する", after[0].homework, "ワークp.20-22（訂正）");
  check("もう1枚は両方追従する", after[1].progress, "二次方程式の解の公式 p.42-46（訂正）");

  console.log("\n[5] 欠席を取り消すと、未受渡のカードは消える");
  await setAttendanceStatus(lesson.id, b.id, ATTENDANCE.PRESENT);
  check("カード枚数", (await cards()).length, 1);

  console.log("\n[6] 受渡済のカードは、欠席を取り消しても控えとして残る");
  await prisma.absenceCard.update({
    where: { id: cardA.id },
    data: { status: CARD_STATUS.DELIVERED, deliveredAt: new Date() },
  });
  await setAttendanceStatus(lesson.id, a.id, ATTENDANCE.PRESENT);
  const kept = await cards();
  check("カード枚数", kept.length, 1);
  check("状態", kept[0].status, CARD_STATUS.DELIVERED);

  console.log("\n[7] 受渡済のカードは、授業記録を直しても書き換わらない");
  await saveRecord(lesson.id, {
    progress: "まったく別の内容",
    homework: "まったく別の宿題",
    note: "",
  });
  check("渡した時点の内容のまま", (await cards())[0].progress, "青木くんは前半のみ p.42-43");

  console.log("\n[8] 遅刻・振替ではカードを作らない");
  await setAttendanceStatus(lesson.id, c.id, ATTENDANCE.LATE);
  check("カード枚数は増えない", (await cards()).length, 1);
  await setAttendanceStatus(lesson.id, c.id, ATTENDANCE.MAKEUP);
  check("カード枚数は増えない", (await cards()).length, 1);

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
