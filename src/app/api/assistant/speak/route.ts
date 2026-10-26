import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { speakAsPersona } from '@/services/voice-speak.service'
import { AssistantSpeakRequestSchema } from '@/types/assistant-speak'

/** 对话里 🔊 念她的回复（②c-2）：派一条念的任务，回 jobId，客户端用音频状态那条路等它好。 */
export const POST = createApiRoute({
  schema: AssistantSpeakRequestSchema,
  routeName: 'POST /api/assistant/speak',
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  handler: async (clerkId, data) => speakAsPersona(clerkId, data),
})
