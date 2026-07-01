-- AlterTable
ALTER TABLE "Lab" ADD COLUMN     "monthlyVolumeTarget" INTEGER,
ADD COLUMN     "targetTatDays" INTEGER NOT NULL DEFAULT 3;

