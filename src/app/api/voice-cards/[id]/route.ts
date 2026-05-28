import 'server-only'

import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import {
  deleteVoiceCard,
  getVoiceCard,
  updateVoiceCard,
} from '@/services/cards/voice-card.service'
import { UpdateVoiceCardRequestSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/voice-cards/[id]',
  notFoundMessage: 'Voice card not found',
  handler: async (clerkId, id) => getVoiceCard(clerkId, id),
})

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateVoiceCardRequestSchema,
  routeName: 'PATCH /api/voice-cards/[id]',
  notFoundMessage: 'Voice card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateVoiceCard(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/voice-cards/[id]',
  notFoundMessage: 'Voice card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteVoiceCard(clerkId, id),
})
