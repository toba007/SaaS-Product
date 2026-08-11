-- CreateTable
CREATE TABLE "ShiftPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "weights" TEXT NOT NULL DEFAULT '',
    "lastResult" TEXT NOT NULL DEFAULT '',
    "generatedAt" DATETIME,
    "confirmedAt" DATETIME,
    "confirmedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShiftDemand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'INDIV_2',
    "required" INTEGER NOT NULL DEFAULT 0,
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ShiftDemand_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShiftPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftDemand_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftDemand_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherShiftRule" (
    "teacherId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "maxPerDay" INTEGER NOT NULL DEFAULT 4,
    "maxPerWeek" INTEGER NOT NULL DEFAULT 12,
    "maxConsecutive" INTEGER NOT NULL DEFAULT 3,
    "minPerWeek" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TeacherShiftRule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "termId" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "planId" INTEGER,
    "subjectId" INTEGER,
    "format" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "score" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShiftPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ShiftAssignment" ("createdAt", "date", "id", "note", "periodId", "teacherId", "termId") SELECT "createdAt", "date", "id", "note", "periodId", "teacherId", "termId" FROM "ShiftAssignment";
DROP TABLE "ShiftAssignment";
ALTER TABLE "new_ShiftAssignment" RENAME TO "ShiftAssignment";
CREATE INDEX "ShiftAssignment_date_idx" ON "ShiftAssignment"("date");
CREATE INDEX "ShiftAssignment_planId_idx" ON "ShiftAssignment"("planId");
CREATE UNIQUE INDEX "ShiftAssignment_teacherId_date_periodId_key" ON "ShiftAssignment"("teacherId", "date", "periodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ShiftPlan_fromDate_toDate_idx" ON "ShiftPlan"("fromDate", "toDate");

-- CreateIndex
CREATE INDEX "ShiftDemand_date_idx" ON "ShiftDemand"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDemand_planId_date_periodId_subjectId_format_key" ON "ShiftDemand"("planId", "date", "periodId", "subjectId", "format");
