import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createUserAudioDirectUpload } from '@/services/upload-audio.service'
import { CreateUploadAudioDirectRequestSchema } from '@/types'

export const maxDuration = 10

export const POST = createApiRoute({
  schema: CreateUploadAudioDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  routeName: 'POST /api/upload-audio/direct',
  handler: async (clerkId, data) => {
    return await createUserAudioDirectUpload(clerkId, data)
  },
})
