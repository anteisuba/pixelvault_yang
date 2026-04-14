import 'server-only'

import { GenerateVariationsRequestSchema } from '@/types'
import { ApiRequestError } from '@/lib/errors'
import {
  getAnalysisById,
  generateVariations,
} from '@/services/image-analysis.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const maxDuration = 55

export const POST = createApiPostByIdRoute({
  schema: GenerateVariationsRequestSchema,
  routeName: 'POST /api/image/analyze/[id]/variations',
  handler: async (clerkId, id, data) => {
    const analysis = await getAnalysisById(id, clerkId)
    if (!analysis) {
      throw new ApiRequestError(
        'NOT_FOUND',
        404,
        'errors.notFound',
        'Analysis not found',
      )
    }
    return generateVariations(clerkId, id, data.models, data.aspectRatio)
  },
})
