import { PROMPT_TAG_CURATED_DEFINITIONS } from '@/constants/prompt-tags.curated'
import { PROMPT_TAG_DANBOORU_DEFINITIONS } from '@/constants/prompt-tags.danbooru.generated'

export const PROMPT_TAG_DEFINITIONS = [
  ...PROMPT_TAG_CURATED_DEFINITIONS,
  ...PROMPT_TAG_DANBOORU_DEFINITIONS,
] as const

export const PROMPT_TAG_RECENT_STORAGE_PREFIX = 'pv.prompt-tags.recent.v1'
