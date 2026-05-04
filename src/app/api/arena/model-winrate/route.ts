import 'server-only'

import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { TASK_TYPES } from '@/lib/classify-task-type'
import { getModelWinRatesByTask } from '@/services/arena-winrate.service'

export const dynamic = 'force-dynamic'

const ModelWinRateQuerySchema = z.object({
  taskType: z.enum(TASK_TYPES),
})

export const GET = createApiGetRoute({
  schema: ModelWinRateQuerySchema,
  routeName: 'GET /api/arena/model-winrate',
  requireAuth: true,
  handler: async ({ data }) => {
    const winRates = await getModelWinRatesByTask(data.taskType)
    return { winRates: Object.fromEntries(winRates) }
  },
})
