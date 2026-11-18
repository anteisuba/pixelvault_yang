import { getLoraAssetSourceUrl } from '@/features/lora/lib/lora-asset-source-url'
import {
  CivitaiLoraLibraryItemSchema,
  type CivitaiLoraLibraryItem,
  type LoraAssetRecord,
} from '@/types'

/**
 * 收藏记录 → 详情页吃的条目形状。缺的热度 / 作者留空（详情页没有就不写）；Civitai
 * 的收藏打开后会取回那一版的完整条目换上去（按版本号认）。
 */
export function assetToLibraryItem(
  asset: LoraAssetRecord,
): CivitaiLoraLibraryItem {
  const license = asset.sourceSnapshot?.license
  return {
    ...asset,
    modelId: asset.modelId ?? 0,
    modelVersionId: asset.modelVersionId ?? 0,
    versionName: asset.name,
    creatorName: asset.sourceSnapshot?.author ?? null,
    creatorAvatarUrl: null,
    modelPageUrl: getLoraAssetSourceUrl(asset) ?? '',
    tags: [],
    downloadCount: 0,
    thumbsUpCount: 0,
    allowCommercialUse: license?.commercialUse ?? [],
    allowDerivatives: license?.allowDerivatives ?? false,
    allowNoCredit: license?.allowNoCredit ?? true,
    thumbImageUrl: null,
    cardImageUrl: null,
    coverColor: null,
    coverImageUrlOriginal: null,
    triggerAlternates: [],
    recommendedPrompt: asset.recommendedPrompt ?? null,
    recommendedPromptAlternates: asset.recommendedPromptAlternates ?? [],
    triggerSource: asset.triggerSource ?? 'official',
    fileHashAutoV3: asset.fileHashAutoV3 ?? null,
    fileSizeBytes: asset.sourceSnapshot?.fileSizeBytes ?? null,
  }
}

/**
 * 按版本号取回来的那一条（`resolveCivitaiLoraAPI`）：Civitai 命中时本来就是完整条目，
 * 照原样用；本地库命中（收藏记录）补成条目形状。
 */
export function resolvedAssetToLibraryItem(
  asset: LoraAssetRecord,
): CivitaiLoraLibraryItem {
  const parsed = CivitaiLoraLibraryItemSchema.safeParse(asset)
  return parsed.success ? parsed.data : assetToLibraryItem(asset)
}

/** 库条目 id `civitai:<模型>:<版本>` → 两个号；别的写法（Hugging Face 等）= `null`。 */
export function parseCivitaiLibraryItemId(
  id: string,
): { modelId: number; modelVersionId: number } | null {
  const match = /^civitai:(\d+):(\d+)$/.exec(id)
  if (!match) return null
  const modelId = Number(match[1])
  const modelVersionId = Number(match[2])
  return modelVersionId > 0 ? { modelId, modelVersionId } : null
}
