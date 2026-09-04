-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "slotsPerWeek" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassGroup_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassGroup" ("capacity", "createdAt", "fromDate", "grade", "id", "level", "name", "subjectId", "toDate") SELECT "capacity", "createdAt", "fromDate", "grade", "id", "level", "name", "subjectId", "toDate" FROM "ClassGroup";
DROP TABLE "ClassGroup";
ALTER TABLE "new_ClassGroup" RENAME TO "ClassGroup";
CREATE INDEX "ClassGroup_grade_subjectId_idx" ON "ClassGroup"("grade", "subjectId");
CREATE INDEX "ClassGroup_fromDate_toDate_idx" ON "ClassGroup"("fromDate", "toDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
