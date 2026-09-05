-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShiftDemand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "subjectIds" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'INDIV_2',
    "required" INTEGER NOT NULL DEFAULT 0,
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ShiftDemand_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShiftPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftDemand_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftDemand_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- 既存の行は科目1つぶんの需要。subjectIds をその1件で埋める。
-- 空のままだと (planId, date, periodId, subjectIds, format) が重複して
-- 一意インデックスが張れない（同じ枠の英語と数学がぶつかる）。
INSERT INTO "new_ShiftDemand" ("date", "format", "id", "note", "periodId", "planId", "required", "studentCount", "subjectId", "subjectIds") SELECT "date", "format", "id", "note", "periodId", "planId", "required", "studentCount", "subjectId", CAST("subjectId" AS TEXT) FROM "ShiftDemand";
DROP TABLE "ShiftDemand";
ALTER TABLE "new_ShiftDemand" RENAME TO "ShiftDemand";
CREATE INDEX "ShiftDemand_date_idx" ON "ShiftDemand"("date");
CREATE UNIQUE INDEX "ShiftDemand_planId_date_periodId_subjectIds_format_key" ON "ShiftDemand"("planId", "date", "periodId", "subjectIds", "format");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
