import 'server-only'

import { z } from 'zod'

import { CreateStyleCardSchema } from '@/types'
import { listStyleCards, createStyleCard } from '@/services/style-card.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/style-cards',
  requireAuth: true,
  handler: async ({ clerkId, data }) =>
    listStyleCards(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateStyleCardSchema,
  routeName: 'POST /api/style-cards',
  handler: async (clerkId, data) => createStyleCard(clerkId, data),
})
