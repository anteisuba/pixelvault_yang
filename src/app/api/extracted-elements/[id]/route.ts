import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiDeleteRoute } from '@/lib/api-route-factory'
import { deleteExtractedElement } from '@/services/extracted-element.service'
import { ensureUser } from '@/services/user.service'

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/extracted-elements/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  notFoundMessage: 'Extracted element not found',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    const { deleted } = await deleteExtractedElement(user.id, id)
    return deleted
  },
})
