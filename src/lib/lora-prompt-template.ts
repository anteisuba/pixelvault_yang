import type { LoraAssetRecord, LoraAssetType } from '@/types'

/**
 * Compose a "starter prompt" for a LoRA — the gap users hit when they
 * stare at an empty prompt box after activating a LoRA.
 *
 * Priority:
 *   1. If the asset carries an author-recommended prompt (Civitai
 *      `trainedWords[0]` after cleaning), use it verbatim. The original
 *      LoRA author knows best — our generic scaffold almost always
 *      underperforms their hand-tuned starter.
 *   2. Otherwise fall back to a type-aware scaffold:
 *      - subject (character / object) → portrait framing with quality tags
 *      - style (aesthetic / lineart / effect) → scenery framing with mood
 *
 * Always leads with the trigger word so the LoRA fires. Used in both
 * the LoRA Library inspector ("Copy template") and the in-canvas
 * StudioLoraChip ("Use this prompt").
 */
export function buildLoraPromptTemplate(
  asset: Pick<LoraAssetRecord, 'triggerWord' | 'type'> & {
    recommendedPrompt?: string | null
  },
): string {
  const authorPrompt = asset.recommendedPrompt?.trim()
  if (authorPrompt) return authorPrompt

  const trigger = asset.triggerWord.trim()
  if (asset.type === 'style') {
    return `${trigger}, beautiful scenery, soft cinematic lighting, highly detailed`
  }
  return `${trigger}, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality`
}

export type LoraTemplateAsset = {
  triggerWord: string
  type: LoraAssetType
  recommendedPrompt?: string | null
}
