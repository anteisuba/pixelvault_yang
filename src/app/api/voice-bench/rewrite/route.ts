import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { rewriteAsPersona } from '@/services/voice-bench-rewrite.service'
import { VoiceBenchRewriteRequestSchema } from '@/types/voice-bench'

/** 配音台「按她说」（③-2a）：输入框里那几行改成她的口吻，回到输入框（⛔ 直接念）。 */
export const POST = createApiRoute({
  schema: VoiceBenchRewriteRequestSchema,
  routeName: 'POST /api/voice-bench/rewrite',
  rateLimit: RATE_LIMIT_CONFIGS.promptEnhance,
  handler: async (clerkId, data) => rewriteAsPersona(clerkId, data),
})
