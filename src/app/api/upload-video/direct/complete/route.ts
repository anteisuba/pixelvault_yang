import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { completeUserVideoDirectUpload } from '@/services/upload-video.service'
import { CompleteUploadVideoDirectRequestSchema } from '@/types'

export const maxDuration = 60

export const POST = createApiRoute({
  schema: CompleteUploadVideoDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/upload-video/direct/complete',
  handler: async (clerkId, data) => {
    const generation = await completeUserVideoDirectUpload(clerkId, data)
    return { generation }
  },
})
