import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getModelById } from '@/constants/models'
import { GenerateAudioRequestSchema } from '@/types'
import {
  generateAudioForUser,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 120

export const POST = createApiRoute({
  schema: GenerateAudioRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  routeName: 'POST /api/generate-audio',
  handler: async (clerkId, data) => {
    const model = getModelById(data.modelId)
    const adapterType = model?.adapterType

    // Fish Audio: synchronous — returns generation directly
    if (adapterType === AI_ADAPTER_TYPES.FISH_AUDIO) {
      const generation = await generateAudioForUser(clerkId, data)
      return { generation }
    }

    // FAL / others: async queue — returns job references
    const result = await submitAudioGeneration(clerkId, data)
    return result
  },
})
