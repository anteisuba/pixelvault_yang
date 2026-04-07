import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { AuthError, ApiRequestError } from '@/lib/errors'
import { GallerySearchSchema, type GalleryResponseData } from '@/types'
import {
  getPublicGenerations,
  countPublicGenerations,
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

      const [generations, total] = await Promise.all([
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
        }),
        countPublicGenerations({
          search: data.search,
          model: data.model,
          type: data.type,
          timeRange: data.timeRange,
          userId,
          likedByUserId,
        }),
      ])

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
