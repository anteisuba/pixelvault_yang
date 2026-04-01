import { ImageEditSchema } from '@/types'
import {
  removeBackground,
  upscaleImage,
  persistEditedImage,
} from '@/services/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getSystemApiKey } from '@/lib/platform-keys'
import { ApiKeyError } from '@/lib/errors'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 120

export const POST = createApiRoute({
  schema: ImageEditSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageEdit,
  routeName: 'POST /api/image/edit',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)

    // Resolve fal.ai API key: user's saved key first, then platform key
    const userKeyRecord = await findActiveKeyForAdapter(
      user.id,
      AI_ADAPTER_TYPES.FAL,
    )
    const apiKey =
      userKeyRecord?.keyValue ?? getSystemApiKey(AI_ADAPTER_TYPES.FAL)

    if (!apiKey) {
      throw new ApiKeyError(
        'missing',
        'No fal.ai API key available. Add one in API Keys.',
      )
    }

    const result =
      data.action === 'upscale'
        ? await upscaleImage(data.imageUrl, apiKey)
        : await removeBackground(data.imageUrl, apiKey)

    // Persist to R2 + DB if requested
    if (data.persist && data.generationId) {
      const generation = await persistEditedImage({
        userId: user.id,
        resultUrl: result.imageUrl,
        sourceGenerationId: data.generationId,
        action: data.action === 'remove-background' ? 'remove-bg' : 'upscale',
        width: result.width,
        height: result.height,
      })
      return { ...result, generation }
    }

    return result
  },
})
