-- CreateTable
CREATE TABLE "SchoolSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "indivMaxStudents" INTEGER NOT NULL DEFAULT 2,
    "maxGroupRooms" INTEGER NOT NULL DEFAULT 1,
    "maxIndivRooms" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Period" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "termKind" TEXT NOT NULL DEFAULT 'REGULAR',
    "gradeBand" TEXT NOT NULL DEFAULT 'ALL',
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Period" ("endTime", "id", "name", "order", "startTime", "termKind") SELECT "endTime", "id", "name", "order", "startTime", "termKind" FROM "Period";
DROP TABLE "Period";
ALTER TABLE "new_Period" RENAME TO "Period";
CREATE INDEX "Period_termKind_gradeBand_order_idx" ON "Period"("termKind", "gradeBand", "order");
CREATE UNIQUE INDEX "Period_termKind_gradeBand_name_key" ON "Period"("termKind", "gradeBand", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
