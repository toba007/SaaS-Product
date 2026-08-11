/*
  Warnings:

  - The required column `icsToken` was added to the `Teacher` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Teacher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kana" TEXT NOT NULL DEFAULT '',
    "employment" TEXT NOT NULL DEFAULT 'PART_TIME',
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "punchToken" TEXT NOT NULL,
    "icsToken" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "hourlyWage" INTEGER NOT NULL DEFAULT 0,
    "commuteRegular" INTEGER NOT NULL DEFAULT 0,
    "commuteSpot" INTEGER NOT NULL DEFAULT 0
);
-- 既存の講師には、その場でランダムな購読トークンを配る。
-- 空にはできない（一意制約があり、かつ URL の秘密そのものであるため）。
INSERT INTO "new_Teacher" ("active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "loginId", "name", "passwordHash", "phone", "punchToken", "role", "icsToken") SELECT "active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "loginId", "name", "passwordHash", "phone", "punchToken", "role", lower(hex(randomblob(16))) FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE UNIQUE INDEX "Teacher_punchToken_key" ON "Teacher"("punchToken");
CREATE UNIQUE INDEX "Teacher_icsToken_key" ON "Teacher"("icsToken");
CREATE UNIQUE INDEX "Teacher_loginId_key" ON "Teacher"("loginId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
