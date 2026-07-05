-- CreateTable
CREATE TABLE "DigitalSlide" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "slideUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'image',
    "magnification" TEXT,
    "stain" TEXT,
    "scanner" TEXT,
    "fileSizeBytes" INTEGER,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideAnnotation" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#4F46E5',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlideAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigitalSlide_labId_idx" ON "DigitalSlide"("labId");

-- CreateIndex
CREATE INDEX "DigitalSlide_recordId_idx" ON "DigitalSlide"("recordId");

-- CreateIndex
CREATE INDEX "SlideAnnotation_labId_idx" ON "SlideAnnotation"("labId");

-- CreateIndex
CREATE INDEX "SlideAnnotation_slideId_idx" ON "SlideAnnotation"("slideId");

-- AddForeignKey
ALTER TABLE "DigitalSlide" ADD CONSTRAINT "DigitalSlide_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSlide" ADD CONSTRAINT "DigitalSlide_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideAnnotation" ADD CONSTRAINT "SlideAnnotation_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideAnnotation" ADD CONSTRAINT "SlideAnnotation_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DigitalSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

