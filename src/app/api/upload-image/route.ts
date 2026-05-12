import { UploadImageRequestSchema } from '@/types'
import { uploadUserImage } from '@/services/upload-image.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 60

export const POST = createApiRoute({
  schema: UploadImageRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/upload-image',
  handler: async (clerkId, data) => {
    const generation = await uploadUserImage(clerkId, data)
    return { generation }
  },
})
