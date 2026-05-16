import 'server-only'

import { z } from 'zod'

import {
  batchAssignProject,
  batchDeleteGenerations,
  batchUpdateVisibility,
} from '@/services/generation.service'
import { batchSetLike } from '@/services/like.service'
import { deleteManyFromR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { ApiRequestError } from '@/lib/errors'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

const BatchDeleteSchema = z.object({
  action: z.literal('delete'),
  ids: z.array(z.string().uuid()).min(1).max(100),
})

const BatchVisibilitySchema = z.object({
  action: z.literal('visibility'),
  ids: z.array(z.string().uuid()).min(1).max(100),
  field: z.enum(['isPublic', 'isPromptPublic']),
  value: z.boolean(),
})

const BatchLikeSchema = z.object({
  action: z.literal('like'),
  ids: z.array(z.string().uuid()).min(1).max(100),
  value: z.boolean(),
})

const BatchProjectSchema = z.object({
  action: z.literal('project'),
  ids: z.array(z.string().uuid()).min(1).max(100),
  projectId: z.string().uuid().nullable(),
})

const BatchRequestSchema = z.discriminatedUnion('action', [
  BatchDeleteSchema,
  BatchVisibilitySchema,
  BatchLikeSchema,
  BatchProjectSchema,
])

export const POST = createApiRoute({
  schema: BatchRequestSchema,
  routeName: 'POST /api/generations/batch',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)

    if (data.action === 'delete') {
      const { deletedCount, storageKeys } = await batchDeleteGenerations(
        data.ids,
        user.id,
      )
      deleteManyFromR2(storageKeys).catch(() => {})
      return { deletedCount }
    }

    if (data.action === 'like') {
      const { updatedCount } = await batchSetLike(user.id, data.ids, data.value)
      return { updatedCount }
    }

    if (data.action === 'project') {
      const updatedCount = await batchAssignProject(
        data.ids,
        user.id,
        data.projectId,
      )
      if (updatedCount === null) {
        throw new ApiRequestError(
          'PROJECT_NOT_FOUND',
          404,
          'errors.notFound',
          'Folder not found or access denied',
        )
      }
      return { updatedCount }
    }

    const updatedCount = await batchUpdateVisibility(
      data.ids,
      user.id,
      data.field,
      data.value,
    )
    return { updatedCount }
  },
})
