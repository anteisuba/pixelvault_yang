import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteCharacterSticker,
  setCharacterStickerBlocked,
} from '@/services/cards/character-sticker.service'
import { UpdateCharacterStickerSchema } from '@/types/character-sticker'

/** 拉黑 / 取消拉黑她的一张表情包（拉黑了她不再发）。 */
export const PATCH = createApiPatchByIdRoute({
  schema: UpdateCharacterStickerSchema,
  routeName: 'PATCH /api/character-stickers/[id]',
  notFoundMessage: 'Sticker not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: (clerkId, id, data) =>
    setCharacterStickerBlocked(clerkId, id, data.isBlocked),
})

/** 删掉她的一张表情包（连 R2 上那张）。 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/character-stickers/[id]',
  notFoundMessage: 'Sticker not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: (clerkId, id) => deleteCharacterSticker(clerkId, id),
})
