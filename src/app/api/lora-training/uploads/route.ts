import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createTrainingImageDirectUpload } from '@/services/lora-training.service'
import { CreateLoraTrainingUploadRequestSchema } from '@/types'

export const maxDuration = 10

/**
 * POST /api/lora-training/uploads
 *
 * Stage 1 of the browser-direct training-image upload: sign one R2 PUT. The
 * image bytes never enter a Next function (the old multipart route drained up
 * to 8 MB per pick, 50 picks per job, through Vercel), so the form's
 * per-image progress now measures a browser → R2 request.
 */
export const POST = createApiRoute({
  schema: CreateLoraTrainingUploadRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/lora-training/uploads',
  handler: async (clerkId, data) => {
    return await createTrainingImageDirectUpload(clerkId, data)
  },
})
