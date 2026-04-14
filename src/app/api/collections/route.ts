import 'server-only'

import { z } from 'zod'

import {
  getUserCollections,
  createCollection,
} from '@/services/collection.service'
import { ensureUser } from '@/services/user.service'
import { CreateCollectionSchema } from '@/types'
import { ApiRequestError } from '@/lib/errors'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/collections',
  requireAuth: true,
  handler: async ({ clerkId }) => {
    const user = await ensureUser(clerkId!)
    return getUserCollections(user.id)
  },
})

export const POST = createApiRoute({
  schema: CreateCollectionSchema,
  routeName: 'POST /api/collections',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    try {
      return await createCollection(user.id, data)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'MAX_COLLECTIONS_EXCEEDED'
      ) {
        throw new ApiRequestError(
          'MAX_COLLECTIONS_EXCEEDED',
          422,
          'errors.collections.maxExceeded',
          'Maximum collections limit reached',
        )
      }
      throw error
    }
  },
})
