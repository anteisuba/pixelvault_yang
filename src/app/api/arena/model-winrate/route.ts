import 'server-only'

import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { TASK_TYPES } from '@/lib/classify-task-type'
import { getModelWinRatesByTask } from '@/services/arena-winrate.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const dynamic = 'force-dynamic'

const ModelWinRateQuerySchema = z.object({
  taskType: z.enum(TASK_TYPES),
})

export const GET = createApiGetRoute({
  schema: ModelWinRateQuerySchema,
  routeName: 'GET /api/arena/model-winrate',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ data }) => {
    const winRates = await getModelWinRatesByTask(data.taskType)
    return { winRates: Object.fromEntries(winRates) }
  },
})
