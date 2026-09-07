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

import { rethrowNodeWorkflowStateError } from '../state-error'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  handler: async (clerkId, id) => {
    try {
      return await getNodeWorkflowProject(clerkId, id)
    } catch (error) {
      return rethrowNodeWorkflowStateError(error)
    }
  },
})

export const PUT = createApiPutRoute({
  schema: UpdateNodeWorkflowProjectRequestSchema,
  routeName: 'PUT /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    try {
      return await updateNodeWorkflowProject(clerkId, id, data)
    } catch (error) {
      return rethrowNodeWorkflowStateError(error)
    }
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/node-workflow/projects/[id]',
  notFoundMessage: 'Node workflow project not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    await deleteNodeWorkflowProject(clerkId, id)
  },
})
