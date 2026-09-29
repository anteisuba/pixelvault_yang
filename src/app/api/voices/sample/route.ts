import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { importVoiceSample } from '@/services/voice-sample.service'
import { ImportVoiceSampleRequestSchema } from '@/types'

export const maxDuration = 30

// POST /api/voices/sample — 平台音色的示例存进自己的存储（「用这段」）
export const POST = createApiRoute({
  schema: ImportVoiceSampleRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  routeName: 'POST /api/voices/sample',
  handler: async (clerkId, data) => importVoiceSample(clerkId, data.voiceId),
})
