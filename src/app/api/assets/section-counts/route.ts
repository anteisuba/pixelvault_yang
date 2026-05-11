import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { ApiRequestError, AuthError } from '@/lib/errors'
import { getAssetSectionCounts } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import type { AssetSectionCounts } from '@/types'

const SectionCountsQuerySchema = z.object({})

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
  handler: async ({ clerkId }) => {
    if (!clerkId) throw new AuthError()
    try {
      const user = await ensureUser(clerkId)
      return getAssetSectionCounts(user.id)
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
