-- Persist Civitai-source provenance on favorited (imported) LoRA assets so the
-- studio "贴近来源图" / source-match feature can reconstruct the author + mined
-- community prompt after a reload or via a shared ?style= link. All nullable
-- and additive — safe to apply online; trained/curated rows keep them NULL.
ALTER TABLE "LoraAsset" ADD COLUMN "civitaiModelId" INTEGER;
ALTER TABLE "LoraAsset" ADD COLUMN "civitaiModelVersionId" INTEGER;
ALTER TABLE "LoraAsset" ADD COLUMN "civitaiFileHashAutoV3" TEXT;
ALTER TABLE "LoraAsset" ADD COLUMN "recommendedPrompt" TEXT;
