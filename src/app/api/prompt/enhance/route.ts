import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  EnhancePromptRequestSchema,
  type EnhancePromptResponseData,
} from '@/types'
import { enhancePrompt } from '@/services/kernel/prompt-enhance.service'

export const maxDuration = 300

// ─── POST /api/prompt/enhance ────────────────────────────────────

export const POST = createApiRoute<
  typeof EnhancePromptRequestSchema,
  EnhancePromptResponseData
>({
  maxDuration,
  schema: EnhancePromptRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.promptEnhance,
  routeName: 'POST /api/prompt/enhance',
  handler: async (clerkId, data) => {
    return enhancePrompt(
      clerkId,
      data.prompt,
      data.style,
      data.modelId,
      data.apiKeyId,
    )
  },
})
