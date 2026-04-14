import 'server-only'

import { z } from 'zod'

import { toggleGenerationVisibility } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { ApiRequestError } from '@/lib/errors'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'

const VisibilitySchema = z.object({
  field: z
    .enum(['isPublic', 'isPromptPublic', 'isFeatured'])
    .default('isPublic'),
})

export const PATCH = createApiPatchByIdRoute({
  schema: VisibilitySchema,
  routeName: 'PATCH /api/generations/[id]/visibility',
  notFoundMessage: 'Generation not found or access denied',
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    const result = await toggleGenerationVisibility(id, user.id, data.field)
    if (!result) return null
    if ('error' in result) {
      throw new ApiRequestError(
        'VISIBILITY_ERROR',
        422,
        'errors.generation.visibilityError',
        result.error,
      )
    }
    return result
  },
})
