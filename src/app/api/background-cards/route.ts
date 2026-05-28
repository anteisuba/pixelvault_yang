import 'server-only'

import { z } from 'zod'

import { CreateBackgroundCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  listBackgroundCards,
  createBackgroundCard,
} from '@/services/cards/background-card.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/background-cards',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listBackgroundCards(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateBackgroundCardSchema,
  routeName: 'POST /api/background-cards',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createBackgroundCard(clerkId, data),
})
