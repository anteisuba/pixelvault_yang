import 'server-only'

import { createApiPatchByIdRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { retakeVoiceLine } from '@/services/voiceroom.service'
import { RetakeVoiceLineBodySchema } from '@/types/voiceroom'

export const maxDuration = 120

/**
 * 重录一条台词——换情感，或改词。
 *
 * 覆盖这条台词的 job；被换下来的那次生成留在素材库里，不删。
 */
export const PATCH = createApiPatchByIdRoute({
  schema: RetakeVoiceLineBodySchema,
  routeName: 'PATCH /api/voiceroom/lines/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.generateAudio,
  handler: async (clerkId, id, data) =>
    retakeVoiceLine(clerkId, { ...data, lineId: id }),
})
