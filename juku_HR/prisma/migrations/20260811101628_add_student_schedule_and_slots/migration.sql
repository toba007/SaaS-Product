-- CreateTable
CREATE TABLE "StudentSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentSubjectId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "date" TEXT,
    "periodId" INTEGER NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSchedule_studentSubjectId_fkey" FOREIGN KEY ("studentSubjectId") REFERENCES "StudentSubject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSchedule_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudentSubject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "slotsPerWeek" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSubject_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentSubject" ("active", "createdAt", "format", "id", "studentId", "subjectId") SELECT "active", "createdAt", "format", "id", "studentId", "subjectId" FROM "StudentSubject";
DROP TABLE "StudentSubject";
ALTER TABLE "new_StudentSubject" RENAME TO "StudentSubject";
CREATE INDEX "StudentSubject_subjectId_format_idx" ON "StudentSubject"("subjectId", "format");
CREATE UNIQUE INDEX "StudentSubject_studentId_subjectId_format_key" ON "StudentSubject"("studentId", "subjectId", "format");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StudentSchedule_dayOfWeek_periodId_idx" ON "StudentSchedule"("dayOfWeek", "periodId");

-- CreateIndex
CREATE INDEX "StudentSchedule_date_periodId_idx" ON "StudentSchedule"("date", "periodId");

-- CreateIndex
CREATE INDEX "StudentSchedule_fromDate_toDate_idx" ON "StudentSchedule"("fromDate", "toDate");
