import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  extractElement,
  persistEditedImage,
  resolveEditApiKey,
} from '@/services/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { ImageExtractSchema } from '@/types'

export const maxDuration = 120

export const POST = createApiRoute({
  schema: ImageExtractSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageEdit,
  routeName: 'POST /api/image/extract',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    const apiKey = await resolveEditApiKey(user.id, data.modelId, data.apiKeyId)

    const result = await extractElement({
      imageUrl: data.imageUrl,
      prompt: data.prompt,
      apiKey,
      invert: data.invert,
      modelId: data.modelId,
    })

    const generation = await persistEditedImage({
      userId: user.id,
      resultUrl: result.imageUrl,
      sourceGenerationId: data.sourceGenerationId,
      action: 'extract',
      width: result.width,
      height: result.height,
    })

    // Replace the in-memory data URL with the permanent R2 URL — Chrome
    // refuses to download multi-MB base64 strings, and we want both the
    // download button and the preview <img> to point at storage.
    return {
      imageUrl: generation.url,
      width: result.width,
      height: result.height,
      generation,
    }
  },
})
