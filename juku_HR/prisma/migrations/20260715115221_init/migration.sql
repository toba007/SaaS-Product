-- CreateTable
CREATE TABLE "Subject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Room" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "Period" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kana" TEXT NOT NULL DEFAULT '',
    "employment" TEXT NOT NULL DEFAULT 'PART_TIME',
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hourlyWage" INTEGER NOT NULL DEFAULT 0,
    "perLessonWage" INTEGER NOT NULL DEFAULT 0,
    "commuteRegular" INTEGER NOT NULL DEFAULT 0,
    "commuteSpot" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("teacherId", "subjectId"),
    CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kana" TEXT NOT NULL DEFAULT '',
    "grade" TEXT NOT NULL,
    "school" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "periodId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lesson_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "progress" TEXT NOT NULL DEFAULT '',
    "homework" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonRecord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    CONSTRAINT "Attendance_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AbsenceCard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "progress" TEXT NOT NULL DEFAULT '',
    "homework" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AbsenceCard_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AbsenceCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AbsenceCard_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Period_name_key" ON "Period"("name");

-- CreateIndex
CREATE INDEX "Lesson_date_idx" ON "Lesson"("date");

-- CreateIndex
CREATE INDEX "Lesson_date_periodId_idx" ON "Lesson"("date", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonRecord_lessonId_key" ON "LessonRecord"("lessonId");

-- CreateIndex
CREATE INDEX "Attendance_studentId_idx" ON "Attendance"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_lessonId_studentId_key" ON "Attendance"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "AbsenceCard_status_idx" ON "AbsenceCard"("status");

-- CreateIndex
CREATE INDEX "AbsenceCard_studentId_status_idx" ON "AbsenceCard"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceCard_lessonId_studentId_key" ON "AbsenceCard"("lessonId", "studentId");
