import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { listVoiceBenchLines } from '@/services/voice-speak.service'

/** 配音台（③）：现在这一位的嗓子念过的台词。念一句走 `POST /api/assistant/speak`。 */
export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/voice-bench',
  requireAuth: true,
  cacheHeader: 'private, no-store',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listVoiceBenchLines(clerkId!),
})
