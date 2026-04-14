import 'server-only'

import { z } from 'zod'

import { ARENA } from '@/constants/config'
import { getArenaHistory } from '@/services/arena.service'
import { createApiGetRoute } from '@/lib/api-route-factory'

const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(ARENA.HISTORY_PAGE_SIZE),
})

export const GET = createApiGetRoute({
  schema: HistoryQuerySchema,
  routeName: 'GET /api/arena/history',
  requireAuth: true,
  handler: async ({ clerkId, data }) =>
    getArenaHistory(clerkId!, data.page, data.limit),
})
