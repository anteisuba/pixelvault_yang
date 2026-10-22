import 'server-only'

import { z } from 'zod'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import {
  getPromptTagStack,
  savePromptTagStack,
} from '@/services/prompts/prompt-tag-stack.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { PromptTagStackSidesSchema } from '@/types/prompt-tags'

// LoRA 台的标签堆：读整份 / 整份覆盖。

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/prompt-tags/stack',
  requireAuth: true,
  cacheHeader: 'private, no-store',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => ({
    stack: await getPromptTagStack(clerkId!),
  }),
})

export const PUT = createApiRoute({
  schema: PromptTagStackSidesSchema,
  routeName: 'PUT /api/prompt-tags/stack',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    await savePromptTagStack(clerkId, data)
    return {}
  },
})
