import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import {
  outpaintImage,
  persistEditedImage,
  resolveEditApiKey,
} from '@/services/image/image-edit.service'
import { ensureUser } from '@/services/user.service'
import { OutpaintRequestSchema } from '@/types'

export const maxDuration = 180

export const POST = createApiRoute({
  schema: OutpaintRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageEdit,
  routeName: 'POST /api/image/outpaint',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    const apiKey = await resolveEditApiKey(user.id, data.modelId, data.apiKeyId)
    const result = await outpaintImage({
      imageUrl: data.imageUrl,
      padding: data.padding,
      prompt: data.prompt,
      apiKey,
      negativePrompt: data.negativePrompt,
      modelId: data.modelId,
    })
    const generation = await persistEditedImage({
      userId: user.id,
      resultUrl: result.imageUrl,
      sourceGenerationId: data.sourceGenerationId,
      action: 'outpaint',
      width: result.width,
      height: result.height,
    })

    return { ...result, generation }
  },
})
