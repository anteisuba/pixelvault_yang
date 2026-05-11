import 'server-only'

import {
  deleteGeneration,
  getGenerationById,
} from '@/services/generation.service'
import { deleteFromR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { logger } from '@/lib/logger'
import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
} from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import type { GenerationRecord } from '@/types'

/**
 * Owner-scoped fetch of a single generation, including the heavy
 * snapshot column so the Studio remix flow can rebuild the original
 * preset. Public viewers should keep using /gallery/[id] — this
 * endpoint refuses access to other users' rows.
 */
export const GET = createApiGetByIdRoute<GenerationRecord>({
  routeName: 'GET /api/generations/[id]',
  notFoundMessage: 'Generation not found or access denied',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    const generation = await getGenerationById(id)
    if (!generation || generation.userId !== user.id) return null
    return generation
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/generations/[id]',
  notFoundMessage: 'Generation not found or access denied',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
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
