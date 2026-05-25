import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiDeleteRoute } from '@/lib/api-route-factory'
import { touchNodeWorkflowProject } from '@/services/node-workflow.service'

/**
 * Marks a Node Studio project as the user's active one by bumping its
 * lastActiveAt to now. Highest lastActiveAt becomes the default open
 * project the next time the user lands on /studio/node.
 *
 * Uses the delete-route factory because it's the closest existing match —
 * idempotent POST with no body, returns null. (The factory's name is
 * misleading; it's really "POST-with-id-and-no-body".)
 */
export const POST = createApiDeleteRoute({
  routeName: 'POST /api/node-workflow/projects/[id]/activate',
  notFoundMessage: 'Node workflow project not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    await touchNodeWorkflowProject(clerkId, id)
  },
})
