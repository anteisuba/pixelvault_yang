import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { completeUserAudioDirectUpload } from '@/services/upload-audio.service'
import { CompleteUploadAudioDirectRequestSchema } from '@/types'

export const maxDuration = 60

export const POST = createApiRoute({
  schema: CompleteUploadAudioDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.assetUpload,
  routeName: 'POST /api/upload-audio/direct/complete',
  handler: async (clerkId, data) => {
    const generation = await completeUserAudioDirectUpload(clerkId, data)
    return { generation }
  },
})
