import { z } from 'zod'

import { PROMPT_TAG_STACK_MAX_SELECTIONS } from '@/constants/prompt-tags'

export const PROMPT_TAG_TYPE_VALUES = [
  'quality',
  'aesthetic',
  'dataset',
  'subject',
  'character_trait',
  'outfit',
  'pose',
  'scene',
  'camera',
  'lighting',
  'style',
  'negative',
  'lora_trigger',
  'prompt_preset',
] as const

export type PromptTagType = (typeof PROMPT_TAG_TYPE_VALUES)[number]

export const PROMPT_TAG_SOURCE_VALUES = [
  'system',
  'danbooru',
  'lora_asset',
  'civitai',
  'model_keyword',
  'mined_prompt',
  'recent',
  'user',
] as const

export type PromptTagSource = (typeof PROMPT_TAG_SOURCE_VALUES)[number]

export const PROMPT_POLARITY_VALUES = ['positive', 'negative'] as const

export type PromptPolarity = (typeof PROMPT_POLARITY_VALUES)[number]

export type PromptTagConfidence = 'official' | 'inferred' | 'mined' | 'user'

export type PromptTagModelFamily =
  | 'any'
  | 'flux'
  | 'sdxl'
  | 'anima'
  | 'novelai'
  | 'sd15'
  | 'other'

export interface PromptTagDefinition {
  id: string
  type: PromptTagType
  source: PromptTagSource
  label: string
  promptText: string
  aliases: readonly string[]
  category: string
  polarity: PromptPolarity
  modelFamilies: readonly PromptTagModelFamily[]
  modelIds?: readonly string[]
  orderGroup: number
  defaultWeight?: number
  confidence?: PromptTagConfidence
  popularity?: number
  loraAssetId?: string
  loraStyleCode?: string
  loraUrl?: string
  loraDefaultScale?: number
  conflictsWith?: readonly string[]
  requires?: readonly string[]
}

export const PromptTagSelectionSchema = z.object({
  id: z.string().min(1).max(200),
  tagId: z.string().min(1).max(500),
  promptText: z.string().max(2000),
  label: z.string().max(500),
  polarity: z.enum(PROMPT_POLARITY_VALUES),
  source: z.enum(PROMPT_TAG_SOURCE_VALUES),
  type: z.enum(PROMPT_TAG_TYPE_VALUES),
  weight: z.number().finite().optional(),
  enabled: z.boolean(),
  orderIndex: z.number().finite(),
  insertedAt: z.string().max(64),
})

export type PromptTagSelection = z.infer<typeof PromptTagSelectionSchema>

/** 账号里存的那份标签堆（`PromptTagStack` 表）：读写接口的形状。 */
export const PromptTagStackSidesSchema = z.object({
  positive: z
    .array(PromptTagSelectionSchema)
    .max(PROMPT_TAG_STACK_MAX_SELECTIONS),
  negative: z
    .array(PromptTagSelectionSchema)
    .max(PROMPT_TAG_STACK_MAX_SELECTIONS),
})

export type PromptTagStackSides = z.infer<typeof PromptTagStackSidesSchema>

/** 旧版只存在浏览器里的那份（`pv.prompt-tag-stack.v1.<clerkId>`）：只在首次上传时读。 */
export interface PromptTagStack {
  ownerClerkId: string
  version: 1
  positive: PromptTagSelection[]
  negative: PromptTagSelection[]
  updatedAt: string
}

export interface PromptTagSearchResult {
  tag: PromptTagDefinition
  score: number
  isSelected: boolean
  matchedAlias?: string
}

export interface PromptTagCompileResult {
  freePrompt?: string
  negativePrompt?: string
  positiveTagText: string
  negativeTagText: string
}
