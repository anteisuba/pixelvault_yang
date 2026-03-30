import { AnalyzeImageRequestSchema } from '@/types'
import { analyzeImage } from '@/services/image-analysis.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS, MAX_DURATION_CONFIGS } from '@/constants/config'
import { GenerationValidationError } from '@/lib/errors'

export const maxDuration = MAX_DURATION_CONFIGS.imageAnalyze

// Max image upload size: 10MB base64 ≈ ~14MB string
const MAX_IMAGE_DATA_LENGTH = 14 * 1024 * 1024

export const POST = createApiRoute({
  schema: AnalyzeImageRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageAnalyze,
  routeName: 'POST /api/image/analyze',
  handler: async (clerkId, data) => {
    if (data.imageData.length > MAX_IMAGE_DATA_LENGTH) {
      throw new GenerationValidationError([
        {
          field: 'imageData',
          message: 'Image too large. Maximum size is 10MB.',
        },
      ])
    }
    return analyzeImage(clerkId, data.imageData, data.apiKeyId)
  },
})
