import { AnalyzeImageRequestSchema } from '@/types'
import { analyzeImage } from '@/services/image/image-analysis.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { GenerationValidationError } from '@/lib/errors'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 30

// Max raw payload for inline (data:) image uploads — 10MB binary ≈ 14MB
// base64 string. Http(s) URLs aren't bounded here because the byte-level
// cap (`ANALYSIS_MAX_IMAGE_BYTES`) is enforced server-side by
// `fetchAsBuffer` against `Content-Length` and the actual response.
const MAX_DATA_URL_PAYLOAD = 14 * 1024 * 1024

export const POST = createApiRoute({
  schema: AnalyzeImageRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageAnalyze,
  routeName: 'POST /api/image/analyze',
  handler: async (clerkId, data) => {
    if (
      data.imageData.startsWith('data:') &&
      data.imageData.length > MAX_DATA_URL_PAYLOAD
    ) {
      throw new GenerationValidationError([
        {
          field: 'imageData',
          message: 'Image too large. Maximum size is 10MB.',
        },
      ])
    }
    return analyzeImage(clerkId, data.imageData, data.dimensions, data.apiKeyId)
  },
})
