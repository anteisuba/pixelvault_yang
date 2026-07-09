import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { completeUserImageDirectUpload } from '@/services/upload-image.service'
import { CompleteUploadImageDirectRequestSchema } from '@/types'

export const maxDuration = 60

export const POST = createApiRoute({
  schema: CompleteUploadImageDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/upload-image/direct/complete',
  handler: async (clerkId, data) => {
    const generation = await completeUserImageDirectUpload(clerkId, data)
    return { generation }
  },
})
