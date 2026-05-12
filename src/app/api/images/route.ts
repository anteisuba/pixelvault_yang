import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { AuthError, ApiRequestError } from '@/lib/errors'
import { GallerySearchSchema, type GalleryResponseData } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  getPublicGenerations,
  countPublicGenerations,
  getAnonymousPublicGalleryPage,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const GalleryRequestSchema = GallerySearchSchema.extend({
  mine: z.enum(['1']).optional(),
})

export const GET = createApiGetRoute<
  typeof GalleryRequestSchema,
  GalleryResponseData
>({
  schema: GalleryRequestSchema,
  routeName: 'GET /api/images',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  /**
   * Anonymous public gallery (no `mine`, no `liked`, no Clerk session)
   * is identical for every viewer, so let the CDN cache it for ~10s
   * and serve stale for 60s while revalidating — that's enough to
   * absorb traffic spikes and feed the client's silent SWR fetches
   * after a Krea-style cache-hit switch without ever touching the DB.
   *
   * Signed-in / mine / liked responses are per-viewer (carry isLiked,
   * isPublic, projectId), so they get a short private browser cache
   * instead — long enough that hammering setFilters / hover-prefetch
   * during the same session doesn't bombard the API.
   */
  cacheHeader: ({ data, clerkId }) => {
    const isAnonymousPublic = !data.mine && !data.liked && !clerkId
    if (isAnonymousPublic) {
      return 'public, s-maxage=10, stale-while-revalidate=60'
    }
    return 'private, max-age=5, stale-while-revalidate=30'
  },
  handler: async ({ clerkId, data }): Promise<GalleryResponseData> => {
    try {
      const mine = data.mine === '1'
      const liked = data.liked === '1'
      let userId: string | undefined
      let likedByUserId: string | undefined
      let viewerUserId: string | undefined

      // Resolve user when auth-gated features are used or user is logged in
      if (mine || liked || clerkId) {
        if ((mine || liked) && !clerkId) {
          throw new AuthError()
        }
        if (clerkId) {
          const user = await ensureUser(clerkId)
          if (mine) userId = user.id
          if (liked) likedByUserId = user.id
          viewerUserId = user.id
        }
      }

      const canUseAnonymousCache = !userId && !likedByUserId && !viewerUserId

      const { generations, total } = canUseAnonymousCache
        ? await getAnonymousPublicGalleryPage({
            page: data.page,
            limit: data.limit,
            search: data.search,
            model: data.model,
            sort: data.sort,
            type: data.type,
            timeRange: data.timeRange,
            projectId: data.projectId,
          })
        : await (async () => {
            const [gens, tot] = await Promise.all([
              getPublicGenerations({
                page: data.page,
                limit: data.limit,
                search: data.search,
                model: data.model,
                sort: data.sort,
                type: data.type,
                timeRange: data.timeRange,
                userId,
                likedByUserId,
                viewerUserId,
                projectId: data.projectId,
                provider: data.provider,
              }),
              countPublicGenerations({
                search: data.search,
                model: data.model,
                type: data.type,
                timeRange: data.timeRange,
                userId,
                likedByUserId,
                projectId: data.projectId,
                provider: data.provider,
              }),
            ])
            return { generations: gens, total: tot }
          })()

      return {
        generations,
        page: data.page,
        limit: data.limit,
        total,
        hasMore: data.page * data.limit < total,
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }

      throw new ApiRequestError(
        'GALLERY_FETCH_FAILED',
        500,
        'errors.gallery.loadFailed',
        'Failed to fetch gallery',
      )
    }
  },
})
