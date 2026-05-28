import 'server-only'

import { z } from 'zod'

import { CreateCharacterCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  listCharacterCards,
  createCharacterCard,
} from '@/services/cards/character-card.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/character-cards',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listCharacterCards(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateCharacterCardSchema,
  routeName: 'POST /api/character-cards',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createCharacterCard(clerkId, data),
})
