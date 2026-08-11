/**
 * その日のやりとり（備考欄）を確かめる。
 *
 * 大事なのは2つ。
 *   - 講師は自分のスレッドにしか書けないこと
 *   - 未読が正しく数えられること（気づかれないと連絡として役に立たない）
 *   npm run verify
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  markThreadRead,
  resolveThreadTarget,
  thread,
  unreadByDate,
  unreadForAdmin,
  unreadTotalForTeacher,
} from "../lib/comments";
import { ROLE } from "../lib/constants";
import { resetAll } from "./_reset";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}` +
      (ok
        ? ""
        : `\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`),
  );
}

// verify は同じ test.db を使い回すので、前の台本が残っていると外部キーで落ちる
async function reset() {
  await resetAll();
}

const D1 = "2026-09-15";
const D2 = "2026-09-16";

async function main() {
  await reset();

  const admin = await prisma.teacher.create({
    data: {
      name: "佐藤 健一",
      loginId: "sato",
      passwordHash: "x",
      role: ROLE.ADMIN,
    },
  });
  const t1 = await prisma.teacher.create({
    data: { name: "鈴木 花子", loginId: "suzuki", passwordHash: "x" },
  });
  const t2 = await prisma.teacher.create({
    data: { name: "田中 太郎", loginId: "tanaka", passwordHash: "x" },
  });

  console.log("\n[1] 講師は自分のスレッドにしか書けない");
  // 講師が他人の id をフォームに詰めて送っても、自分の id に矯正される
  check("他人を指定しても自分になる", resolveThreadTarget(t1, t2.id), t1.id);
  check("0 を指定しても自分になる", resolveThreadTarget(t1, 0), t1.id);
  check("管理者は宛先を選べる", resolveThreadTarget(admin, t2.id), t2.id);
  check("管理者でも宛先が不正なら弾く", resolveThreadTarget(admin, 0), null);

  console.log("\n[2] 提出画面と確定画面から同じスレッドが見える");
  // 画面が2つあってもスレッドは「講師 × 日付」で1本。データが1つなら必ず同じものが出る。
  await prisma.shiftComment.create({
    data: {
      teacherId: t1.id,
      date: D1,
      senderRole: ROLE.TEACHER,
      senderId: t1.id,
      body: "この日は大学の試験で厳しいです",
    },
  });
  await prisma.shiftComment.create({
    data: {
      teacherId: t1.id,
      date: D1,
      senderRole: ROLE.ADMIN,
      senderId: admin.id,
      body: "了解です。代わりに16日をお願いできますか",
    },
  });
  const th = await thread(t1.id, D1);
  check("2件が古い順に並ぶ", th.map((m) => m.senderRole), [
    ROLE.TEACHER,
    ROLE.ADMIN,
  ]);
  check("書いた人の名前が出る", th[1].senderName, "佐藤 健一");

  console.log("\n[3] 未読は相手が書いたぶんだけ数える");
  const forTeacher = await unreadByDate(t1.id, D1, D2, ROLE.TEACHER);
  check("講師から見た未読は管理者の1件", forTeacher.get(D1) ?? 0, 1);
  const forAdmin = await unreadByDate(t1.id, D1, D2, ROLE.ADMIN);
  check("管理者から見た未読は講師の1件", forAdmin.get(D1) ?? 0, 1);
  check("自分の発言は未読に数えない", forTeacher.get(D2) ?? 0, 0);

  console.log("\n[4] 開くと既読になり、相手のぶんだけ消える");
  await markThreadRead(t1.id, D1, ROLE.TEACHER);
  const afterRead = await unreadByDate(t1.id, D1, D2, ROLE.TEACHER);
  check("講師の未読は消える", afterRead.get(D1) ?? 0, 0);
  const adminStill = await unreadByDate(t1.id, D1, D2, ROLE.ADMIN);
  check("管理者の未読は残ったまま", adminStill.get(D1) ?? 0, 1);

  console.log("\n[5] 管理者は全講師ぶんの未読をまとめて見られる");
  await prisma.shiftComment.create({
    data: {
      teacherId: t2.id,
      date: D2,
      senderRole: ROLE.TEACHER,
      senderId: t2.id,
      body: "16日、入れます",
    },
  });
  const all = await unreadForAdmin(D1, D2);
  check("鈴木の15日", all.get(`${t1.id}:${D1}`) ?? 0, 1);
  check("田中の16日", all.get(`${t2.id}:${D2}`) ?? 0, 1);
  check("他人のスレッドは混ざらない", all.get(`${t1.id}:${D2}`) ?? 0, 0);

  console.log("\n[6] タブのバッジ用の合計");
  await prisma.shiftComment.create({
    data: {
      teacherId: t1.id,
      date: D2,
      senderRole: ROLE.ADMIN,
      senderId: admin.id,
      body: "16日ありがとうございます",
    },
  });
  check("鈴木の未読合計", await unreadTotalForTeacher(t1.id), 1);
  check("田中の未読合計は0", await unreadTotalForTeacher(t2.id), 0);

  console.log(failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件 期待と違う`);
  process.exit(failed === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
