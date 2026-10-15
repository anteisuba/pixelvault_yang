import 'server-only'

import type { ImageIntent, ReferenceAsset } from '@/types'
import { logger } from '@/lib/logger'
import { GenerationValidationError } from '@/lib/errors'
import { validatePrompt, sanitizePrompt } from '@/services/kernel/prompt-guard'

/**
 * `/api/generation/plan` 的意图：过一道提示词守卫，然后把原话当主体。
 *
 * ⚠ 这里**不调模型**（owner 2026-10-15「全跟助手」·⛔ 不在创作者不知情时花谁的 key）：
 * 以前它拿一个平台哨兵用户去「自动」挑一家 key，可哨兵在库里没有 key、平台兜底 2026-10-07
 * 已清，那一步每次都 `MISSING_API_KEY` 落到这里的兜底。真要让模型拆意图，得让创作者点名
 * 一把 key 或跟助手（`resolveKeyOrAssistantRoute`），⛔ 别再拿哨兵用户挑一家。
 */
export async function parseImageIntent(
  naturalLanguage: string,
  referenceAssets?: ReferenceAsset[],
): Promise<ImageIntent> {
  const guardResult = validatePrompt(naturalLanguage)

  if (!guardResult.valid) {
    logger.warn('Intent parser prompt failed guard', {
      reason: guardResult.reason,
    })
    throw new GenerationValidationError([
      {
        field: 'naturalLanguage',
        message: guardResult.reason ?? 'Invalid prompt',
      },
    ])
  }

  return {
    subject: sanitizePrompt(naturalLanguage).slice(0, 500),
    referenceAssets,
  }
}
