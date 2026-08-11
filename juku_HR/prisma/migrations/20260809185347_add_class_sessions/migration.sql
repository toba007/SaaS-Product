/*
  Warnings:

  - You are about to drop the column `dayOfWeek` on the `ClassGroup` table. All the data in the column will be lost.
  - You are about to drop the column `periodId` on the `ClassGroup` table. All the data in the column will be lost.
  - You are about to drop the column `roomId` on the `ClassGroup` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ClassSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classGroupId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "roomId" INTEGER,
    CONSTRAINT "ClassSession_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassSession_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassGroup_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassGroup" ("capacity", "createdAt", "fromDate", "grade", "id", "level", "name", "subjectId", "toDate") SELECT "capacity", "createdAt", "fromDate", "grade", "id", "level", "name", "subjectId", "toDate" FROM "ClassGroup";
DROP TABLE "ClassGroup";
ALTER TABLE "new_ClassGroup" RENAME TO "ClassGroup";
CREATE INDEX "ClassGroup_grade_subjectId_idx" ON "ClassGroup"("grade", "subjectId");
CREATE INDEX "ClassGroup_fromDate_toDate_idx" ON "ClassGroup"("fromDate", "toDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClassSession_dayOfWeek_periodId_idx" ON "ClassSession"("dayOfWeek", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_classGroupId_dayOfWeek_periodId_key" ON "ClassSession"("classGroupId", "dayOfWeek", "periodId");
