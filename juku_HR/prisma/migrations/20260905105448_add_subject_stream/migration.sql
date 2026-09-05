-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "stream" TEXT NOT NULL DEFAULT 'OTHER'
);
INSERT INTO "new_Subject" ("id", "name", "order") SELECT "id", "name", "order" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
