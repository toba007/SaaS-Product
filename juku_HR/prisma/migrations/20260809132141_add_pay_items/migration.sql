-- CreateTable
CREATE TABLE "PayItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'PER_SLOT',
    "source" TEXT NOT NULL DEFAULT '',
    "legacyStyle" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "TeacherPayRate" (
    "teacherId" INTEGER NOT NULL,
    "payItemId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("teacherId", "payItemId"),
    CONSTRAINT "TeacherPayRate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherPayRate_payItemId_fkey" FOREIGN KEY ("payItemId") REFERENCES "PayItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminWork" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "payItemId" INTEGER,
    CONSTRAINT "AdminWork_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminWork_payItemId_fkey" FOREIGN KEY ("payItemId") REFERENCES "PayItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AdminWork" ("date", "id", "minutes", "note", "teacherId") SELECT "date", "id", "minutes", "note", "teacherId" FROM "AdminWork";
DROP TABLE "AdminWork";
ALTER TABLE "new_AdminWork" RENAME TO "AdminWork";
CREATE INDEX "AdminWork_teacherId_date_idx" ON "AdminWork"("teacherId", "date");
CREATE INDEX "AdminWork_date_idx" ON "AdminWork"("date");
CREATE TABLE "new_DutyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'GROUP',
    "payItemId" INTEGER,
    CONSTRAINT "DutyRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DutyRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DutyRecord_payItemId_fkey" FOREIGN KEY ("payItemId") REFERENCES "PayItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DutyRecord" ("date", "id", "periodId", "style", "teacherId") SELECT "date", "id", "periodId", "style", "teacherId" FROM "DutyRecord";
DROP TABLE "DutyRecord";
ALTER TABLE "new_DutyRecord" RENAME TO "DutyRecord";
CREATE INDEX "DutyRecord_date_idx" ON "DutyRecord"("date");
CREATE UNIQUE INDEX "DutyRecord_teacherId_date_periodId_key" ON "DutyRecord"("teacherId", "date", "periodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PayItem_active_order_idx" ON "PayItem"("active", "order");

-- CreateIndex
CREATE INDEX "TeacherPayRate_payItemId_idx" ON "TeacherPayRate"("payItemId");

-- ---------------------------------------------------------------
-- 移行: 今までの給与設定を、そのまま賃金項目として作り直す。
-- ここを飛ばすと、既存の講師の単価がすべて消えて給与が0円になる。
-- ---------------------------------------------------------------

INSERT INTO "PayItem" ("name", "basis", "source", "legacyStyle", "order", "active") VALUES
  ('集団授業',             'PER_SLOT', '',        'GROUP',   1, 1),
  ('個別指導 1対1',        'PER_SLOT', '',        'INDIV_1', 2, 1),
  ('個別指導 1対2',        'PER_SLOT', '',        'INDIV_2', 3, 1),
  ('事務作業',             'PER_HOUR', 'ADMIN',   NULL,      4, 1),
  ('交通費（定期あり期間）', 'PER_DAY',  'REGULAR', NULL,      5, 1),
  ('交通費（定期なし期間）', 'PER_DAY',  'SPOT',    NULL,      6, 1);

-- コマ給: WageRate をそのまま写す
INSERT INTO "TeacherPayRate" ("teacherId", "payItemId", "amount")
SELECT w."teacherId", p."id", w."amount"
  FROM "WageRate" w
  JOIN "PayItem" p ON p."legacyStyle" = w."style";

-- 事務作業の時給
INSERT INTO "TeacherPayRate" ("teacherId", "payItemId", "amount")
SELECT t."id", (SELECT "id" FROM "PayItem" WHERE "source" = 'ADMIN'), t."hourlyWage"
  FROM "Teacher" t WHERE t."hourlyWage" > 0;

-- 交通費（定期あり／なし）
INSERT INTO "TeacherPayRate" ("teacherId", "payItemId", "amount")
SELECT t."id", (SELECT "id" FROM "PayItem" WHERE "source" = 'REGULAR'), t."commuteRegular"
  FROM "Teacher" t WHERE t."commuteRegular" > 0;

INSERT INTO "TeacherPayRate" ("teacherId", "payItemId", "amount")
SELECT t."id", (SELECT "id" FROM "PayItem" WHERE "source" = 'SPOT'), t."commuteSpot"
  FROM "Teacher" t WHERE t."commuteSpot" > 0;

-- 既存の実績を項目に結び付ける
UPDATE "DutyRecord"
   SET "payItemId" = (SELECT "id" FROM "PayItem" WHERE "legacyStyle" = "DutyRecord"."style")
 WHERE "payItemId" IS NULL;

UPDATE "AdminWork"
   SET "payItemId" = (SELECT "id" FROM "PayItem" WHERE "source" = 'ADMIN')
 WHERE "payItemId" IS NULL;
