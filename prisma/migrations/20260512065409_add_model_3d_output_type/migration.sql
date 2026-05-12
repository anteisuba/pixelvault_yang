-- AlterEnum
ALTER TYPE "OutputType" ADD VALUE 'MODEL_3D';

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "modelStorageKey" TEXT,
ADD COLUMN     "modelUrl" TEXT;
