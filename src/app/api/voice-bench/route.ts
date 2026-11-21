import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute } from '@/lib/api-route-factory'
import { listVoiceBenchLines } from '@/services/voice-speak.service'
import { VoiceBenchQuerySchema } from '@/types/voice-bench'

/**
 * 配音台（③）：现在这一位的嗓子念过的台词。念一句走 `POST /api/assistant/speak`。
 * `?voice=<音色卡 id>` = 本次的临时音色：台词按那副读（⛔ 改角色卡绑定）。
 */
export const GET = createApiGetRoute({
  schema: VoiceBenchQuerySchema,
  routeName: 'GET /api/voice-bench',
  requireAuth: true,
  cacheHeader: 'private, no-store',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listVoiceBenchLines(clerkId!, data.voice),
})
