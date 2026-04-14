import 'server-only'

import { z } from 'zod'

import { CreateCharacterCardSchema } from '@/types'
import {
  listCharacterCards,
  createCharacterCard,
} from '@/services/character-card.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/character-cards',
  requireAuth: true,
  handler: async ({ clerkId }) => listCharacterCards(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateCharacterCardSchema,
  routeName: 'POST /api/character-cards',
  handler: async (clerkId, data) => createCharacterCard(clerkId, data),
})
