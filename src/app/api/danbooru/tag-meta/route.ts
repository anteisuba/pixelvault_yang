import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { lookupTagMetaBatch } from '@/services/tag-assist.service'
import { DanbooruTagMetaRequestSchema } from '@/types/tag-assist'

export const POST = createApiRoute({
  routeName: 'POST /api/danbooru/tag-meta',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  schema: DanbooruTagMetaRequestSchema,
  handler: async (_clerkId, data) => lookupTagMetaBatch(data.tags),
})
