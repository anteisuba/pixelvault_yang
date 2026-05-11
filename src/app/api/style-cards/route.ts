import 'server-only'

import { z } from 'zod'

import { CreateStyleCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listStyleCards, createStyleCard } from '@/services/style-card.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/style-cards',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listStyleCards(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateStyleCardSchema,
  routeName: 'POST /api/style-cards',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createStyleCard(clerkId, data),
})
