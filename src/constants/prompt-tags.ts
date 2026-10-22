import { PROMPT_TAG_CURATED_DEFINITIONS } from '@/constants/prompt-tags.curated'
import { PROMPT_TAG_DANBOORU_DEFINITIONS } from '@/constants/prompt-tags.danbooru.generated'

export const PROMPT_TAG_DEFINITIONS = [
  ...PROMPT_TAG_CURATED_DEFINITIONS,
  ...PROMPT_TAG_DANBOORU_DEFINITIONS,
] as const

/** 标签堆每一面（正 / 负）最多几个；账号里那份按它校验。 */
export const PROMPT_TAG_STACK_MAX_SELECTIONS = 200

/** 标签堆改动后等这么久再存到账号里，连续点几下只存一次。 */
export const PROMPT_TAG_STACK_SAVE_DEBOUNCE_MS = 800

// lora-workbench.md §5：PromptTagAutocomplete（正文 inline 补全）配置。
/** 词段长度达到这个阈值才触发搜索/浮层。 */
export const PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH = 2
/** 键入 → 触发搜索的 debounce（ms）。 */
export const PROMPT_TAG_AUTOCOMPLETE_DEBOUNCE_MS = 150
/** 浮层最多展示的候选数。 */
export const PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT = 8
/** popularity（0–50）映射三档不透明度圆点的分界值。 */
export const PROMPT_TAG_POPULARITY_TIER_THRESHOLDS = {
  mid: 17,
  high: 34,
} as const
