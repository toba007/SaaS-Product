-- CreateTable
CREATE TABLE "TimetableRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "termId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "mode" TEXT NOT NULL DEFAULT 'GREEDY',
    "note" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "fromAi" INTEGER NOT NULL DEFAULT 0,
    "fromFallback" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "unplaced" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "appliedAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "TimetableRun_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimetablePlacement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "targetKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "byHand" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TimetablePlacement_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TimetableRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetablePlacement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TimetableRun_termId_startedAt_idx" ON "TimetableRun"("termId", "startedAt");

-- CreateIndex
CREATE INDEX "TimetablePlacement_runId_dayOfWeek_periodId_idx" ON "TimetablePlacement"("runId", "dayOfWeek", "periodId");
