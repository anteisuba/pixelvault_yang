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

export interface PromptTagSelection {
  id: string
  tagId: string
  promptText: string
  label: string
  polarity: PromptPolarity
  source: PromptTagSource
  type: PromptTagType
  weight?: number
  enabled: boolean
  orderIndex: number
  insertedAt: string
}

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
