-- CreateTable
CREATE TABLE "Term" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REGULAR',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "termId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftRequest_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftRequest_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "termId" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Term_startDate_endDate_idx" ON "Term"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "ShiftRequest_date_idx" ON "ShiftRequest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftRequest_teacherId_date_periodId_key" ON "ShiftRequest"("teacherId", "date", "periodId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_date_idx" ON "ShiftAssignment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_teacherId_date_periodId_key" ON "ShiftAssignment"("teacherId", "date", "periodId");
