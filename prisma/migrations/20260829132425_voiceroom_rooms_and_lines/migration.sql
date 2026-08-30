-- CreateTable
CREATE TABLE "VoiceRoom" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "cast" JSONB NOT NULL DEFAULT '[]',
    "bed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceLine" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "speakerId" TEXT NOT NULL,
    "speakerKind" TEXT NOT NULL DEFAULT 'voice',
    "speakerName" TEXT NOT NULL,
    "speakerCover" TEXT,
    "text" TEXT NOT NULL,
    "emotion" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceRoom_userId_updatedAt_idx" ON "VoiceRoom"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "VoiceLine_roomId_order_idx" ON "VoiceLine"("roomId", "order");

-- AddForeignKey
ALTER TABLE "VoiceRoom" ADD CONSTRAINT "VoiceRoom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceLine" ADD CONSTRAINT "VoiceLine_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceLine" ADD CONSTRAINT "VoiceLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
