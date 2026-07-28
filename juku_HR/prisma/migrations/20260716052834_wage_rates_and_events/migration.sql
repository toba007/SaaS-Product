/*
  Warnings:

  - You are about to drop the column `perLessonWage` on the `Teacher` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "WageRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "style" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WageRate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EVENT',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DutyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'GROUP',
    CONSTRAINT "DutyRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DutyRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DutyRecord" ("date", "id", "periodId", "teacherId") SELECT "date", "id", "periodId", "teacherId" FROM "DutyRecord";
DROP TABLE "DutyRecord";
ALTER TABLE "new_DutyRecord" RENAME TO "DutyRecord";
CREATE INDEX "DutyRecord_date_idx" ON "DutyRecord"("date");
CREATE UNIQUE INDEX "DutyRecord_teacherId_date_periodId_key" ON "DutyRecord"("teacherId", "date", "periodId");
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
    "commuteRegular" INTEGER NOT NULL DEFAULT 0,
    "commuteSpot" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Teacher" ("active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "loginId", "name", "passwordHash", "phone", "punchToken", "role") SELECT "active", "commuteRegular", "commuteSpot", "email", "employment", "hourlyWage", "id", "kana", "loginId", "name", "passwordHash", "phone", "punchToken", "role" FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE UNIQUE INDEX "Teacher_punchToken_key" ON "Teacher"("punchToken");
CREATE UNIQUE INDEX "Teacher_loginId_key" ON "Teacher"("loginId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WageRate_teacherId_style_key" ON "WageRate"("teacherId", "style");

-- CreateIndex
CREATE INDEX "SchoolEvent_startDate_endDate_idx" ON "SchoolEvent"("startDate", "endDate");
