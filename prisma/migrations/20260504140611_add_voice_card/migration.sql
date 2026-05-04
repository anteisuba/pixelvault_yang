-- CreateTable
CREATE TABLE "VoiceCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fish_audio',
    "modelId" TEXT,
    "voiceId" TEXT,
    "referenceAudioUrl" TEXT,
    "referenceAudioStorageKey" TEXT,
    "gender" TEXT,
    "age" TEXT,
    "tone" JSONB NOT NULL DEFAULT '[]',
    "pace" TEXT NOT NULL DEFAULT 'normal',
    "pitch" TEXT,
    "pronunciationDictionary" JSONB NOT NULL DEFAULT '{}',
    "sampleText" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceCard_userId_isDeleted_createdAt_idx" ON "VoiceCard"("userId", "isDeleted", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "VoiceCard" ADD CONSTRAINT "VoiceCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
