import 'server-only'

import { z } from 'zod'

import { CreateProjectSchema } from '@/types'
import { listProjects, createProject } from '@/services/project.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/projects',
  requireAuth: true,
  handler: async ({ clerkId }) => listProjects(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateProjectSchema,
  routeName: 'POST /api/projects',
  handler: async (clerkId, data) => createProject(clerkId, data),
})
