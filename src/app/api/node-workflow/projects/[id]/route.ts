import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
  createApiPutRoute,
} from '@/lib/api-route-factory'
import {
  deleteNodeWorkflowProject,
  getNodeWorkflowProject,
  updateNodeWorkflowProject,
} from '@/services/node/node-workflow.service'
import { UpdateNodeWorkflowProjectRequestSchema } from '@/types/node-workflow'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  handler: async (clerkId, id) => getNodeWorkflowProject(clerkId, id),
})

export const PUT = createApiPutRoute({
  schema: UpdateNodeWorkflowProjectRequestSchema,
  routeName: 'PUT /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateNodeWorkflowProject(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    await deleteNodeWorkflowProject(clerkId, id)
  },
})
