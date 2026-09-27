import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  PromptToTagsRequestSchema,
  type PromptToTagsResponseData,
} from '@/types/tag-composer'
import { translatePromptToTags } from '@/services/kernel/prompt-to-tags.service'

export const maxDuration = 30

// ─── POST /api/prompt/to-tags ────────────────────────────────────

export const POST = createApiRoute<
  typeof PromptToTagsRequestSchema,
  PromptToTagsResponseData
>({
  schema: PromptToTagsRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.promptEnhance,
  routeName: 'POST /api/prompt/to-tags',
  handler: (clerkId, data) => translatePromptToTags(clerkId, data),
})
