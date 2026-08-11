-- AlterTable
ALTER TABLE "SchoolEvent" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "SchoolEvent_seriesId_idx" ON "SchoolEvent"("seriesId");
