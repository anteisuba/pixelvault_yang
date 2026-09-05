import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createUserVideoDirectUpload } from '@/services/upload-video.service'
import { CreateUploadVideoDirectRequestSchema } from '@/types'

export const maxDuration = 10

export const POST = createApiRoute({
  schema: CreateUploadVideoDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.assetUpload,
  routeName: 'POST /api/upload-video/direct',
  handler: async (clerkId, data) => {
    return await createUserVideoDirectUpload(clerkId, data)
  },
})
