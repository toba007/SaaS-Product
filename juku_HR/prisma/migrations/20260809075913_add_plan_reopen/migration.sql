-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftPlan" (
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
    "reopenedAt" DATETIME,
    "reopenedById" INTEGER,
    "reopenReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ShiftPlan" ("confirmedAt", "confirmedById", "createdAt", "fromDate", "generatedAt", "id", "lastResult", "name", "status", "toDate", "weights") SELECT "confirmedAt", "confirmedById", "createdAt", "fromDate", "generatedAt", "id", "lastResult", "name", "status", "toDate", "weights" FROM "ShiftPlan";
DROP TABLE "ShiftPlan";
ALTER TABLE "new_ShiftPlan" RENAME TO "ShiftPlan";
CREATE INDEX "ShiftPlan_fromDate_toDate_idx" ON "ShiftPlan"("fromDate", "toDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
