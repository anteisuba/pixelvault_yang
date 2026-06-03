import { GenerateAudioRequestSchema } from '@/types'
import { submitAudioGeneration } from '@/services/generate-audio.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 120

export const POST = createApiRoute({
  schema: GenerateAudioRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  routeName: 'POST /api/generate-audio',
  handler: async (clerkId, data) => {
    return submitAudioGeneration(clerkId, data)
  },
})
