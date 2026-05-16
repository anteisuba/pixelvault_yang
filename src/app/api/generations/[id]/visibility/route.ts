import 'server-only'

import { z } from 'zod'

import {
  setGenerationVisibility,
  toggleGenerationVisibility,
} from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { ApiRequestError } from '@/lib/errors'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'

const VisibilitySchema = z.object({
  field: z
    .enum(['isPublic', 'isPromptPublic', 'isFeatured'])
    .default('isPublic'),
  value: z.boolean().optional(),
  values: z
    .object({
      isPublic: z.boolean().optional(),
      isPromptPublic: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
    })
    .optional(),
})

export const PATCH = createApiPatchByIdRoute({
  schema: VisibilitySchema,
  routeName: 'PATCH /api/generations/[id]/visibility',
  notFoundMessage: 'Generation not found or access denied',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    const result = data.values
      ? await setGenerationVisibility(id, user.id, data.values)
      : await toggleGenerationVisibility(id, user.id, data.field, data.value)
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
