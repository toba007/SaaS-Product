/**
 * 塾の予定まわり（繰り返しの展開と、まとめて削除）を確かめる。
 *
 * 休校日はシフト希望の可否に直結する。1件多い／少ないが、そのまま
 * 「出せるはずの日に出せない」「休みの日に人が入る」になるので、境目を厚めに見る。
 *   npm run verify
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { MAX_OCCURRENCES, REPEAT, expandRepeat } from "../lib/recurrence";
import { isClosedDate } from "../lib/events";
import { EVENT_KIND } from "../lib/constants";
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

const starts = (os: { startDate: string }[]) => os.map((o) => o.startDate);

async function main() {
  await resetAll();

  console.log("\n[1] 繰り返さないときは1件だけ");
  check(
    "1日の予定",
    expandRepeat("2026-08-13", "2026-08-13", REPEAT.NONE, ""),
    [{ startDate: "2026-08-13", endDate: "2026-08-13" }],
  );
  // 終わりの日を入れ忘れても、1件は作られる（予定が消えるより良い）
  check(
    "終わりの日が空でも落ちない",
    starts(expandRepeat("2026-08-13", "2026-08-13", REPEAT.WEEKLY, "")),
    ["2026-08-13"],
  );

  console.log("\n[2] 毎週・隔週");
  // 2026-08-02 は日曜。「毎週日曜は休校」の想定
  check(
    "毎週（8/2〜8/30）",
    starts(expandRepeat("2026-08-02", "2026-08-02", REPEAT.WEEKLY, "2026-08-30")),
    ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"],
  );
  check(
    "隔週",
    starts(expandRepeat("2026-08-02", "2026-08-02", REPEAT.BIWEEKLY, "2026-08-30")),
    ["2026-08-02", "2026-08-16", "2026-08-30"],
  );
  // 終わりの日ちょうどは作る。1日でも過ぎたら作らない
  check(
    "終わりの日の1日前まで",
    starts(expandRepeat("2026-08-02", "2026-08-02", REPEAT.WEEKLY, "2026-08-29")),
    ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23"],
  );

  console.log("\n[3] 毎月は「同じ日」を保つ");
  check(
    "毎月15日",
    starts(expandRepeat("2026-08-15", "2026-08-15", REPEAT.MONTHLY, "2026-11-30")),
    ["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"],
  );
  // 30日足す作りにすると、月をまたぐたびに日がずれる。無い日は飛ばす。
  check(
    "31日は無い月を飛ばす",
    starts(expandRepeat("2027-01-31", "2027-01-31", REPEAT.MONTHLY, "2027-05-31")),
    ["2027-01-31", "2027-03-31", "2027-05-31"],
  );

  console.log("\n[4] 期間の予定は、長さを保ったまま繰り返す");
  const span = expandRepeat("2026-08-01", "2026-08-03", REPEAT.WEEKLY, "2026-08-15");
  check("回数", span.length, 3);
  check("2回目も3日間", span[1], {
    startDate: "2026-08-08",
    endDate: "2026-08-10",
  });

  console.log("\n[5] 作りすぎの歯止め");
  // 終わりの日を打ち間違えて10年ぶん作られると、消すのも一苦労になる
  const many = expandRepeat("2026-01-01", "2026-01-01", REPEAT.WEEKLY, "2100-01-01");
  check("上限で打ち切る", many.length, MAX_OCCURRENCES);

  console.log("\n[6] 繰り返しで入れた休校日は、ちゃんと休校として効く");
  const seriesId = "test-series";
  const occ = expandRepeat("2026-08-02", "2026-08-02", REPEAT.WEEKLY, "2026-08-30");
  await prisma.schoolEvent.createMany({
    data: occ.map((o) => ({
      title: "日曜休校",
      startDate: o.startDate,
      endDate: o.endDate,
      kind: EVENT_KIND.CLOSED,
      seriesId,
    })),
  });
  check("作られた件数", await prisma.schoolEvent.count(), 5);
  check("8/9 は休校", await isClosedDate("2026-08-09"), true);
  check("8/10 は休校ではない", await isClosedDate("2026-08-10"), false);

  console.log("\n[7] まとめて削除（この予定だけ／これ以降／すべて）");
  const rows = await prisma.schoolEvent.findMany({ orderBy: { startDate: "asc" } });
  // 「この予定だけ」= 1件消える
  await prisma.schoolEvent.delete({ where: { id: rows[0].id } });
  check("この予定だけ", await prisma.schoolEvent.count(), 4);

  // 「これ以降」= その開始日から後ろが消える（8/16, 8/23, 8/30 の3件）
  await prisma.schoolEvent.deleteMany({
    where: { seriesId, startDate: { gte: "2026-08-16" } },
  });
  check("これ以降", await prisma.schoolEvent.count(), 1);
  check("残ったのは8/9", (await prisma.schoolEvent.findFirst())?.startDate, "2026-08-09");

  // 「すべて」= まとまりごと消える
  await prisma.schoolEvent.deleteMany({ where: { seriesId } });
  check("すべて", await prisma.schoolEvent.count(), 0);
  check("消したあとは休校でなくなる", await isClosedDate("2026-08-09"), false);

  console.log(failed === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${failed}件 期待と違う`);
  process.exit(failed === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
