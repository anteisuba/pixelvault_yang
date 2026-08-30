import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createVoiceLine } from '@/services/voiceroom.service'
import { CreateVoiceLineRequestSchema } from '@/types/voiceroom'

/** 生成一条台词要跑满一次 TTS，所以 maxDuration 跟音频链路对齐。 */
export const maxDuration = 120

/**
 * 说一句话。
 *
 * 限流用 `generateAudio`（和 `/api/generate-audio` 同一档）——背后是同一个
 * provider 配额，配音间不该因为长得像聊天就能绕过它。
 */
export const POST = createApiRoute({
  schema: CreateVoiceLineRequestSchema,
  routeName: 'POST /api/voiceroom/lines',
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  handler: async (clerkId, data) => createVoiceLine(clerkId, data),
})
