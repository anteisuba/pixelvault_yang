import 'server-only'

import { z } from 'zod'

import { CreateProjectSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listProjects, createProject } from '@/services/project.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/projects',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listProjects(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateProjectSchema,
  routeName: 'POST /api/projects',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createProject(clerkId, data),
})
