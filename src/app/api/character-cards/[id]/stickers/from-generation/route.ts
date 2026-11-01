import 'server-only'

import { z } from 'zod'

import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { addCharacterStickerFromGeneration } from '@/services/cards/character-sticker.service'

export const maxDuration = 60

/** 素材库里的一张也放进她的表情包（存成模板框的勾，owner 11-01）。 */
export const POST = createApiPostByIdRoute({
  schema: z.object({ generationId: z.string().trim().min(1).max(64) }),
  routeName: 'POST /api/character-cards/[id]/stickers/from-generation',
  handler: async (clerkId, id, data) => {
    const sticker = await addCharacterStickerFromGeneration(
      clerkId,
      id,
      data.generationId,
    )
    if (!sticker)
      throw new ApiRequestError(
        'NOT_FOUND',
        404,
        'errors.generation.notFound',
        'Character card or image not found',
      )
    return sticker
  },
})
