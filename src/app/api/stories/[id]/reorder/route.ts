import 'server-only'

import { z } from 'zod'

import { reorderPanels } from '@/services/story.service'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

const ReorderRequestSchema = z.object({
  panelIds: z.array(z.string().trim().min(1)).min(1),
})

export const POST = createApiPostByIdRoute({
  schema: ReorderRequestSchema,
  routeName: 'POST /api/stories/[id]/reorder',
  handler: async (clerkId, id, data) =>
    reorderPanels(id, clerkId, data.panelIds),
})
