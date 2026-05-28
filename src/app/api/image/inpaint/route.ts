import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  inpaintImage,
  persistEditedImage,
  resolveEditApiKey,
} from '@/services/image/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { InpaintRequestSchema } from '@/types'

export const maxDuration = 180

export const POST = createApiRoute({
  schema: InpaintRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageEdit,
  routeName: 'POST /api/image/inpaint',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    const apiKey = await resolveEditApiKey(user.id, data.modelId, data.apiKeyId)
    const result = await inpaintImage({
      imageUrl: data.imageUrl,
      maskImageUrl: data.maskImageUrl,
      prompt: data.prompt,
      apiKey,
      negativePrompt: data.negativePrompt,
      modelId: data.modelId,
    })
    const generation = await persistEditedImage({
      userId: user.id,
      resultUrl: result.imageUrl,
      sourceGenerationId: data.sourceGenerationId,
      action: 'inpaint',
      width: result.width,
      height: result.height,
    })

    return { ...result, generation }
  },
})
