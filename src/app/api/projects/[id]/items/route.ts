import 'server-only'

import { UpdateFolderItemsSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { updateFolderItems } from '@/services/project.service'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateFolderItemsSchema,
  routeName: 'PATCH /api/projects/[id]/items',
  notFoundMessage: 'Folder not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateFolderItems(clerkId, id, data),
})
