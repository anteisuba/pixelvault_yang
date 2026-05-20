import { after } from 'next/server'

import { GenerateRequestSchema } from '@/types'
import { generateImageForUser } from '@/services/generate-image.service'
import { processPendingImagePreviewDerivativeOutboxes } from '@/services/image-preview-derivative.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { logger } from '@/lib/logger'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 300

function scheduleImagePreviewDerivativeProcessing() {
  const task = async () => {
    try {
      await processPendingImagePreviewDerivativeOutboxes({ limit: 2 })
    } catch (error) {
      logger.warn('Image preview derivative background processing failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    after(task)
  } catch {
    void task()
  }
}

export const POST = createApiRoute({
  schema: GenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate',
  handler: async (clerkId, data) => {
    const generation = await generateImageForUser(clerkId, data)
    scheduleImagePreviewDerivativeProcessing()
    return { generation }
  },
})
