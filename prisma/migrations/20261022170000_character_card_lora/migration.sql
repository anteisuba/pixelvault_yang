-- CreateTable
CREATE TABLE "CharacterCardLora" (
    "characterCardId" TEXT NOT NULL,
    "loraAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterCardLora_pkey" PRIMARY KEY ("characterCardId","loraAssetId")
);

-- CreateIndex
CREATE INDEX "CharacterCardLora_loraAssetId_idx" ON "CharacterCardLora"("loraAssetId");

-- AddForeignKey
ALTER TABLE "CharacterCardLora" ADD CONSTRAINT "CharacterCardLora_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCardLora" ADD CONSTRAINT "CharacterCardLora_loraAssetId_fkey" FOREIGN KEY ("loraAssetId") REFERENCES "LoraAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

