-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentSubjectId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "date" TEXT,
    "periodId" INTEGER NOT NULL,
    "groupNo" INTEGER NOT NULL DEFAULT 0,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSchedule_studentSubjectId_fkey" FOREIGN KEY ("studentSubjectId") REFERENCES "StudentSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSchedule_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentSchedule" ("createdAt", "date", "dayOfWeek", "fromDate", "id", "periodId", "studentSubjectId", "toDate") SELECT "createdAt", "date", "dayOfWeek", "fromDate", "id", "periodId", "studentSubjectId", "toDate" FROM "StudentSchedule";
DROP TABLE "StudentSchedule";
ALTER TABLE "new_StudentSchedule" RENAME TO "StudentSchedule";
CREATE INDEX "StudentSchedule_dayOfWeek_periodId_idx" ON "StudentSchedule"("dayOfWeek", "periodId");
CREATE INDEX "StudentSchedule_date_periodId_idx" ON "StudentSchedule"("date", "periodId");
CREATE INDEX "StudentSchedule_fromDate_toDate_idx" ON "StudentSchedule"("fromDate", "toDate");
CREATE TABLE "new_TimetablePlacement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "targetKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "groupNo" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "byHand" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TimetablePlacement_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TimetableRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetablePlacement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TimetablePlacement" ("byHand", "dayOfWeek", "id", "kind", "label", "periodId", "reason", "refId", "runId", "targetKey") SELECT "byHand", "dayOfWeek", "id", "kind", "label", "periodId", "reason", "refId", "runId", "targetKey" FROM "TimetablePlacement";
DROP TABLE "TimetablePlacement";
ALTER TABLE "new_TimetablePlacement" RENAME TO "TimetablePlacement";
CREATE INDEX "TimetablePlacement_runId_dayOfWeek_periodId_idx" ON "TimetablePlacement"("runId", "dayOfWeek", "periodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
