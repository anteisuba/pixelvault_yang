import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { completeTrainingImageDirectUpload } from '@/services/lora-training.service'
import { CompleteLoraTrainingUploadRequestSchema } from '@/types'

export const maxDuration = 30

/**
 * POST /api/lora-training/uploads/complete
 *
 * Stage 3: verify the object the browser PUT to R2 (real size, real format by
 * magic bytes) and return the training-image entry the form holds onto. A
 * rejected upload is deleted, so nothing orphaned stays in the bucket.
 */
export const POST = createApiRoute({
  schema: CompleteLoraTrainingUploadRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/lora-training/uploads/complete',
  handler: async (clerkId, data) => {
    return await completeTrainingImageDirectUpload(clerkId, data)
  },
})
