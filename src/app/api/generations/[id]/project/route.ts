import 'server-only'

import { z } from 'zod'

import { assignGenerationToProject } from '@/services/project.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'

const AssignProjectSchema = z.object({
  projectId: z.string().nullable(),
})

export const PATCH = createApiPatchByIdRoute({
  schema: AssignProjectSchema,
  routeName: 'PATCH /api/generations/[id]/project',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    await assignGenerationToProject(clerkId, id, data.projectId)
    return {}
  },
})
