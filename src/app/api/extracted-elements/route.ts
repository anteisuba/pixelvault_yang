import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import {
  createExtractedElement,
  listExtractedElementsForUser,
} from '@/services/extracted-element.service'
import { ensureUser } from '@/services/user.service'
import { ExtractedElementCreateRequestSchema } from '@/types'

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
  cursor: z.string().trim().min(1).optional(),
})

export const GET = createApiGetRoute({
  schema: ListQuerySchema,
  routeName: 'GET /api/extracted-elements',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) => {
    const user = await ensureUser(clerkId!)
    return listExtractedElementsForUser(user.id, {
      limit: data.limit,
      cursor: data.cursor,
    })
  },
})

export const POST = createApiRoute({
  schema: ExtractedElementCreateRequestSchema,
  routeName: 'POST /api/extracted-elements',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    return createExtractedElement({
      userId: user.id,
      extractedImageUrl: data.extractedImageUrl,
      sourceImageUrl: data.sourceImageUrl,
      sourceGenerationId: data.sourceGenerationId ?? null,
      prompt: data.prompt,
      invert: data.invert === true,
      modelId: data.modelId,
      name: data.name ?? null,
    })
  },
})
