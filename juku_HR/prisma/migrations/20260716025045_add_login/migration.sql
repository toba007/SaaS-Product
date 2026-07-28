/*
  Warnings:

  - You are about to drop the column `accessToken` on the `Teacher` table. All the data in the column will be lost.
  - Added the required column `loginId` to the `Teacher` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `Teacher` table without a default value. This is not possible if the table is not empty.

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
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "hourlyWage" INTEGER NOT NULL DEFAULT 0,
    "perLessonWage" INTEGER NOT NULL DEFAULT 0,
    "commuteRegular" INTEGER NOT NULL DEFAULT 0,
    "commuteSpot" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Teacher" ("active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "name", "perLessonWage", "phone", "punchToken") SELECT "active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "name", "perLessonWage", "phone", "punchToken" FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE UNIQUE INDEX "Teacher_punchToken_key" ON "Teacher"("punchToken");
CREATE UNIQUE INDEX "Teacher_loginId_key" ON "Teacher"("loginId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
