import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { uploadVoiceCardCover } from '@/services/cards/voice-card.service'
import { UploadVoiceCardCoverSchema } from '@/types/voice-library'

/** 音色库页「换头像 → 上传」。从画廊挑的图不走这里，直接 PATCH `coverImage`。 */
export const POST = createApiPostByIdRoute({
  schema: UploadVoiceCardCoverSchema,
  routeName: 'POST /api/voice-cards/[id]/cover',
  notFoundMessage: 'Voice card not found',
  rateLimit: RATE_LIMIT_CONFIGS.sensitiveWrite,
  handler: async (clerkId, id, data) =>
    uploadVoiceCardCover(clerkId, id, data.imageData),
})
