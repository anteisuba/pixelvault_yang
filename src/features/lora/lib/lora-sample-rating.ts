import {
  CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
  type LoraNsfwFilter,
} from '@/constants/lora'

/**
 * 详情里一张样例在这一档浏览分级下给不给看（Civitai 数值档，`nsfwLevel`）。
 * 「安全」档只留 None / Soft，**分级未知的也不给看**（宁可少一张，⛔ 漏出露骨图）；
 * 「不设限」「仅 NSFW」两档不挡（服务端已挡掉 Blocked）。
 */
export function isLoraSampleVisible(
  nsfwLevel: number | undefined,
  nsfwFilter: LoraNsfwFilter,
): boolean {
  if (nsfwFilter !== 'safe') return true
  return (
    nsfwLevel !== undefined &&
    nsfwLevel <= CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL
  )
}

export type LoraSampleRating = 'mature' | 'safe'

/**
 * 「分级与授权」那一格写什么：模型级 `nsfw` 标记实测双向都会错（见 `CivitaiLoraLibraryItemSchema.isNsfw`），
 * 所以样例里只要有一张高于「安全」档就写「含成人内容」；只有模型标了安全、样例都取回来了
 * 且每张分级都已知、都在安全档以内，才写「安全」。说不准 = `null`（不写，⛔ 默认成安全）。
 */
export function loraSampleRating({
  modelNsfw,
  sampleLevels,
  settled,
}: {
  /** 模型级标记；没有（收藏记录 / Hugging Face）= `null`。 */
  modelNsfw: boolean | null
  /** 全部样例（含因档位被藏掉的）的分级。 */
  sampleLevels: readonly (number | undefined)[]
  /** 样例取完了（还在取 / 取失败 = false）。 */
  settled: boolean
}): LoraSampleRating | null {
  if (
    sampleLevels.some(
      (level) =>
        level !== undefined &&
        level > CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL,
    )
  ) {
    return 'mature'
  }
  if (modelNsfw === true) return 'mature'
  if (modelNsfw === null || !settled) return null
  if (sampleLevels.some((level) => level === undefined)) return null
  return 'safe'
}
