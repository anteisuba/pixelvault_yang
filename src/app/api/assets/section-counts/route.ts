import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { ApiRequestError, AuthError } from '@/lib/errors'
import { getAssetSectionCounts } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import type { AssetSectionCounts } from '@/types'

const SectionCountsQuerySchema = z.object({
  /** Active type tab — scopes view/folder counts so badges match the grid. */
  type: z.enum(['all', 'image', 'video', 'audio', 'model_3d']).optional(),
})

/**
 * GET /api/assets/section-counts
 *
 * Aggregate counts powering the right-sidebar on /assets. One request
 * per page load instead of one count per sidebar item — keeps the
 * sidebar honest at any scale.
 */
export const GET = createApiGetRoute<
  typeof SectionCountsQuerySchema,
  AssetSectionCounts
>({
  schema: SectionCountsQuerySchema,
  routeName: 'GET /api/assets/section-counts',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) => {
    if (!clerkId) throw new AuthError()
    try {
      const user = await ensureUser(clerkId)
      return getAssetSectionCounts(user.id, data.type)
    } catch (error) {
      if (error instanceof AuthError) throw error
      throw new ApiRequestError(
        'ASSET_COUNTS_FETCH_FAILED',
        500,
        'errors.gallery.loadFailed',
        'Failed to fetch asset section counts',
      )
    }
  },
})
