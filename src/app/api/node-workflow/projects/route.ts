import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  createNodeWorkflowProject,
  listNodeWorkflowProjectsForUser,
  NodeWorkflowProjectLimitError,
} from '@/services/node/node-workflow.service'
import { CreateNodeWorkflowProjectRequestSchema } from '@/types/node-workflow'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/node-workflow/projects',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listNodeWorkflowProjectsForUser(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateNodeWorkflowProjectRequestSchema,
  routeName: 'POST /api/node-workflow/projects',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await createNodeWorkflowProject(clerkId, data)
    } catch (error) {
      if (error instanceof NodeWorkflowProjectLimitError) {
        throw new ApiRequestError(
          'MAX_NODE_WORKFLOW_PROJECTS_EXCEEDED',
          422,
          'errors.nodeWorkflow.maxProjectsExceeded',
          'Maximum Node Studio projects reached',
        )
      }
      throw error
    }
  },
})
