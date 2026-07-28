/*
  Warnings:

  - The required column `accessToken` was added to the `Teacher` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

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
    "accessToken" TEXT NOT NULL,
    "hourlyWage" INTEGER NOT NULL DEFAULT 0,
    "perLessonWage" INTEGER NOT NULL DEFAULT 0,
    "commuteRegular" INTEGER NOT NULL DEFAULT 0,
    "commuteSpot" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Teacher" ("active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "name", "perLessonWage", "phone", "punchToken") SELECT "active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "name", "perLessonWage", "phone", "punchToken" FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE UNIQUE INDEX "Teacher_punchToken_key" ON "Teacher"("punchToken");
CREATE UNIQUE INDEX "Teacher_accessToken_key" ON "Teacher"("accessToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
