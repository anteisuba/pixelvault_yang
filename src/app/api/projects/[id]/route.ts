import 'server-only'

import { UpdateProjectSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { updateProject, deleteProject } from '@/services/project.service'
import {
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const PUT = createApiPutRoute({
  schema: UpdateProjectSchema,
  routeName: 'PUT /api/projects/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateProject(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/projects/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteProject(clerkId, id),
})
