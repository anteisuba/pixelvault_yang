import 'server-only'

import { z } from 'zod'

import { SubmitLoraTrainingSchema } from '@/types'
import {
  submitLoraTraining,
  listLoraTrainingJobs,
} from '@/services/lora-training.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/lora-training',
  requireAuth: true,
  handler: async ({ clerkId }) => listLoraTrainingJobs(clerkId!),
})

export const POST = createApiRoute({
  schema: SubmitLoraTrainingSchema,
  routeName: 'POST /api/lora-training',
  handler: async (clerkId, data) => submitLoraTraining(clerkId, data),
})
