-- CreateTable
CREATE TABLE "FreeTierSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeTierSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeTierSlot_userId_date_idx" ON "FreeTierSlot"("userId", "date");
