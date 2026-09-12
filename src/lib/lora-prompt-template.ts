import { normalizeToLoraBaseFamily } from '@/constants/lora-base-models'
import { LORA_PROMPT_DIALECTS } from '@/constants/lora-prompt-dialects'
import type { LoraAssetRecord, LoraAssetType } from '@/types'

const GENERIC_SKELETON = {
  subject:
    '{trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality',
  style:
    '{trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
} as const

/**
 * Compose a "starter prompt" for a LoRA — the gap users hit when they
 * stare at an empty prompt box after activating a LoRA.
 *
 * Priority:
 *   1. If the asset carries an author-recommended prompt (Civitai
 *      `trainedWords[0]` after cleaning), use it verbatim. The original
 *      LoRA author knows best — our generic scaffold almost always
 *      underperforms their hand-tuned starter.
 *   2. Otherwise fall back to the scaffold of the asset's base-model family
 *      (`LORA_PROMPT_DIALECTS`), picking the subject or style branch by type.
 *      Families that don't normalize keep the generic scaffold — we don't
 *      guess a dialect for an unknown base model.
 *
 * Always leads with the trigger word so the LoRA fires. Used in both
 * the LoRA Library inspector ("Copy template") and the Studio LoRA prompt
 * control ("Use suggested prompt").
 */
export function buildLoraPromptTemplate(
  asset: Pick<LoraAssetRecord, 'baseModelFamily' | 'triggerWord' | 'type'> & {
    recommendedPrompt?: string | null
  },
): string {
  const authorPrompt = asset.recommendedPrompt?.trim()
  if (authorPrompt) return authorPrompt

  const trigger = asset.triggerWord.trim()
  const family = normalizeToLoraBaseFamily(asset.baseModelFamily ?? '')
  const skeleton = family
    ? LORA_PROMPT_DIALECTS[family].skeleton
    : GENERIC_SKELETON
  const branch = asset.type === 'style' ? 'style' : 'subject'

  return fillSkeleton(skeleton[branch], trigger)
}

/**
 * Replace `{trigger}` and drop the tags whose placeholder stays unfilled —
 * a starter prompt has no user content for the `{subject}` / `{style}` branch,
 * and an empty tag ("a photograph of ,") reads worse than no tag at all.
 */
function fillSkeleton(skeleton: string, trigger: string): string {
  return skeleton
    .split(',')
    .map((tag) => tag.trim().replaceAll('{trigger}', trigger))
    .filter((tag) => tag && !tag.includes('{'))
    .join(', ')
}

export type LoraTemplateAsset = {
  baseModelFamily: string
  triggerWord: string
  type: LoraAssetType
  recommendedPrompt?: string | null
}
