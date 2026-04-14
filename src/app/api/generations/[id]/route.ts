import 'server-only'

import { deleteGeneration } from '@/services/generation.service'
import { deleteFromR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import { createApiDeleteRoute } from '@/lib/api-route-factory'

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/generations/[id]',
  notFoundMessage: 'Generation not found or access denied',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    const result = await deleteGeneration(id, user.id)
    if (!result) return false

    // R2 cleanup in background (best-effort)
    deleteFromR2(result.storageKey).catch((error) => {
      logger.error('DELETE /api/generations/[id] R2 cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })

    return true
  },
})
