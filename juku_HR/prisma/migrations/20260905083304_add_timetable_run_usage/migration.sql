-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimetableRun" (
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
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "promptMs" INTEGER NOT NULL DEFAULT 0,
    "outputMs" INTEGER NOT NULL DEFAULT 0,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "unplaced" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "appliedAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "TimetableRun_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimetableRun" ("appliedAt", "elapsedMs", "error", "finishedAt", "fromAi", "fromFallback", "id", "mode", "model", "note", "rejected", "startedAt", "status", "termId", "unplaced") SELECT "appliedAt", "elapsedMs", "error", "finishedAt", "fromAi", "fromFallback", "id", "mode", "model", "note", "rejected", "startedAt", "status", "termId", "unplaced" FROM "TimetableRun";
DROP TABLE "TimetableRun";
ALTER TABLE "new_TimetableRun" RENAME TO "TimetableRun";
CREATE INDEX "TimetableRun_termId_startedAt_idx" ON "TimetableRun"("termId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
