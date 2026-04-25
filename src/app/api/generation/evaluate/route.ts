import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerateEvaluationRequestSchema,
  type GenerationEvaluation,
} from '@/types'
import { evaluateGeneration } from '@/services/generation-evaluator.service'

export const POST = createApiRoute<
  typeof GenerateEvaluationRequestSchema,
  GenerationEvaluation
>({
  schema: GenerateEvaluationRequestSchema,
  routeName: 'POST /api/generation/evaluate',
  handler: async (clerkId, data) => {
    return evaluateGeneration(clerkId, data.generationId)
  },
})
