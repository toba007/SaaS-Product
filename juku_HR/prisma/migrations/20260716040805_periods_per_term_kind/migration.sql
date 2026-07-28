-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Period" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "termKind" TEXT NOT NULL DEFAULT 'REGULAR',
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Period" ("endTime", "id", "name", "order", "startTime") SELECT "endTime", "id", "name", "order", "startTime" FROM "Period";
DROP TABLE "Period";
ALTER TABLE "new_Period" RENAME TO "Period";
CREATE INDEX "Period_termKind_order_idx" ON "Period"("termKind", "order");
CREATE UNIQUE INDEX "Period_termKind_name_key" ON "Period"("termKind", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
