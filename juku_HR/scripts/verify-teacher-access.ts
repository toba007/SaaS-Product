/**
 * ログインと、講師側の画面（/t）の認可を確かめる。
 * 講師が他の講師のシフト・授業・連絡・給与に触れないことが要件。
 *   npm run verify
 */
import "dotenv/config"; // SESSION_SECRET を読む
import { prisma } from "../lib/prisma";
import { hashPassword, parseSessionValue, verifyPassword } from "../lib/auth";
import { canEditLesson, canReadMessage } from "../lib/teacher";
import { computePayslip } from "../lib/payroll";
import { ROLE, homeFor } from "../lib/constants";
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

async function reset() {
  await resetAll();
}

async function main() {
  await reset();

  const subject = await prisma.subject.create({ data: { name: "数学" } });
  const period = await prisma.period.create({
    data: { name: "1限", startTime: "17:00", endTime: "18:20", order: 0 },
  });
  const room = await prisma.room.create({
    data: { name: "集団教室A", format: "GROUP", capacity: 20 },
  });

  // A = 管理者(社員)、B = 講師(時間講師)
  // 単価は賃金項目ごとに持つ。ここでは集団授業の1項目だけあれば足りる。
  const itemGroup = await prisma.payItem.create({
    data: { name: "集団授業", basis: "PER_SLOT", legacyStyle: "GROUP", order: 1 },
  });

  const a = await prisma.teacher.create({
    data: {
      name: "佐藤 健一",
      loginId: "sato",
      passwordHash: hashPassword("sato-pw"),
      role: "ADMIN",
      payRates: { create: [{ payItemId: itemGroup.id, amount: 2600 }] },
    },
  });
  const b = await prisma.teacher.create({
    data: {
      name: "鈴木 美咲",
      loginId: "suzuki",
      passwordHash: hashPassword("suzuki-pw"),
      role: "TEACHER",
      payRates: { create: [{ payItemId: itemGroup.id, amount: 2000 }] },
    },
  });

  const mk = (teacherId: number, date: string) =>
    prisma.lesson.create({
      data: {
        date,
        format: "GROUP",
        periodId: period.id,
        subjectId: subject.id,
        teacherId,
        roomId: room.id,
      },
    });
  const lessonA = await mk(a.id, "2026-07-15");
  const lessonB = await mk(b.id, "2026-07-15");

  console.log("\n[1] パスワードは平文で保存しない");
  check("ハッシュに平文が含まれない", a.passwordHash.includes("sato-pw"), false);
  check("salt:hash の形", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(a.passwordHash), true);
  const again = hashPassword("sato-pw");
  check("同じパスワードでも毎回別のハッシュ", again === a.passwordHash, false);

  console.log("\n[2] パスワードの照合");
  check("正しいパスワード", verifyPassword("sato-pw", a.passwordHash), true);
  check("違うパスワード", verifyPassword("wrong", a.passwordHash), false);
  check("空文字", verifyPassword("", a.passwordHash), false);
  check("他人のパスワード", verifyPassword("suzuki-pw", a.passwordHash), false);
  check("壊れたハッシュ", verifyPassword("sato-pw", "こわれている"), false);

  console.log("\n[3] ログインIDは重複できない");
  let dup = false;
  try {
    await prisma.teacher.create({
      data: { name: "別人", loginId: "sato", passwordHash: hashPassword("x") },
    });
  } catch {
    dup = true;
  }
  check("同じIDでもう1件作れない", dup, true);

  console.log("\n[4] セッションCookieは署名を検証する");
  // createSession は cookies() を使うので、ここでは値の検証だけ確かめる。
  const { createHmac } = await import("node:crypto");
  const sign = (p: string) =>
    createHmac("sha256", process.env.SESSION_SECRET!).update(p).digest("base64url");
  const exp = Date.now() + 60_000;
  const good = `${a.id}.${exp}.${sign(`${a.id}.${exp}`)}`;
  check("正しいCookie", parseSessionValue(good), a.id);
  check("署名がでたらめ", parseSessionValue(`${a.id}.${exp}.aaaa`), null);
  // 講師IDだけ B に書き換えて、なりすませないこと
  check("中身を書き換える", parseSessionValue(`${b.id}.${exp}.${sign(`${a.id}.${exp}`)}`), null);
  check("署名なし", parseSessionValue(`${a.id}.${exp}`), null);
  check("空", parseSessionValue(undefined), null);
  const old = Date.now() - 1000;
  check("期限切れ", parseSessionValue(`${a.id}.${old}.${sign(`${a.id}.${old}`)}`), null);

  console.log("\n[5] 役割で行き先が変わる");
  check("管理者", homeFor(ROLE.ADMIN), "/");
  check("講師", homeFor(ROLE.TEACHER), "/t");

  console.log("\n[6] 授業は自分が担当したものだけ触れる");
  check("Bが自分の授業", await canEditLesson(b.id, lessonB.id), true);
  check("BがAの授業", await canEditLesson(b.id, lessonA.id), false);
  check("存在しない授業", await canEditLesson(b.id, 999999), false);
  check("数値でないID", await canEditLesson(b.id, NaN), false);

  console.log("\n[7] 連絡は自分が受信者のものだけ見える");
  const toBoth = await prisma.message.create({
    data: {
      title: "一斉連絡",
      body: "",
      recipients: { create: [{ teacherId: a.id }, { teacherId: b.id }] },
    },
  });
  const toAOnly = await prisma.message.create({
    data: {
      title: "Aだけへの個別連絡",
      body: "",
      recipients: { create: [{ teacherId: a.id }] },
    },
  });
  check("Bが一斉連絡", await canReadMessage(b.id, toBoth.id), true);
  check("BがA個人宛の連絡", await canReadMessage(b.id, toAOnly.id), false);
  check("AがA個人宛の連絡", await canReadMessage(a.id, toAOnly.id), true);

  console.log("\n[8] 給与は本人のぶんしか出ない");
  await prisma.dutyRecord.create({
    data: { teacherId: a.id, date: "2026-07-15", periodId: period.id },
  });
  await prisma.dutyRecord.createMany({
    data: [
      { teacherId: b.id, date: "2026-07-15", periodId: period.id },
      { teacherId: b.id, date: "2026-07-16", periodId: period.id },
    ],
  });
  const ym = { year: 2026, month: 7 };
  const slipA = await computePayslip(a.id, ym);
  const slipB = await computePayslip(b.id, ym);
  check("Aのコマ数", slipA?.slotCount, 1);
  check("Aの支給額", slipA?.total, 2600);
  check("Bのコマ数", slipB?.slotCount, 2);
  check("AとBの明細は混ざらない", slipB?.total, 4000);

  console.log("\n[9] 退職した講師はログインできない");
  // ログイン判定は「active かつ パスワードが合う」。lib/dal.ts の currentTeacher も active を見る。
  await prisma.teacher.update({ where: { id: b.id }, data: { active: false } });
  const gone = await prisma.teacher.findUnique({ where: { loginId: "suzuki" } });
  const canLogin =
    gone !== null && gone.active && verifyPassword("suzuki-pw", gone.passwordHash);
  check("パスワードは合っていても通らない", canLogin, false);

  console.log(
    failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件が期待と違います`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
