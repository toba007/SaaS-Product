-- CreateTable
CREATE TABLE "Punch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "inAt" TEXT NOT NULL,
    "outAt" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Punch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DutyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    CONSTRAINT "DutyRecord_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DutyRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminWork" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AdminWork_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTICE',
    "options" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "readAt" DATETIME,
    "answer" TEXT,
    "answeredAt" DATETIME,
    CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageRecipient_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Punch_teacherId_date_idx" ON "Punch"("teacherId", "date");

-- CreateIndex
CREATE INDEX "Punch_date_idx" ON "Punch"("date");

-- CreateIndex
CREATE INDEX "DutyRecord_date_idx" ON "DutyRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DutyRecord_teacherId_date_periodId_key" ON "DutyRecord"("teacherId", "date", "periodId");

-- CreateIndex
CREATE INDEX "AdminWork_teacherId_date_idx" ON "AdminWork"("teacherId", "date");

-- CreateIndex
CREATE INDEX "AdminWork_date_idx" ON "AdminWork"("date");

-- CreateIndex
CREATE INDEX "MessageRecipient_teacherId_idx" ON "MessageRecipient"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_messageId_teacherId_key" ON "MessageRecipient"("messageId", "teacherId");
