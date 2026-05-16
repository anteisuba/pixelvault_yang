import 'server-only'

import {
  deleteGeneration,
  getGenerationById,
} from '@/services/generation.service'
import { deleteManyFromR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
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

    deleteManyFromR2(result.storageKeys).catch(() => {})

    return true
  },
})
