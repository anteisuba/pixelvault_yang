import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createUserImageDirectUpload } from '@/services/upload-image.service'
import { CreateUploadImageDirectRequestSchema } from '@/types'

export const maxDuration = 10

export const POST = createApiRoute({
  schema: CreateUploadImageDirectRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/upload-image/direct',
  handler: async (clerkId, data) => {
    return await createUserImageDirectUpload(clerkId, data)
  },
})
