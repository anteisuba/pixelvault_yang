import 'server-only'

import { z } from 'zod'

import { reorderPanels } from '@/services/node/story.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

const ReorderRequestSchema = z.object({
  panelIds: z.array(z.string().trim().min(1)).min(1),
})

export const POST = createApiPostByIdRoute({
  schema: ReorderRequestSchema,
  routeName: 'POST /api/stories/[id]/reorder',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    reorderPanels(id, clerkId, data.panelIds),
})
