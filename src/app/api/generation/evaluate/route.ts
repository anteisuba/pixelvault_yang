import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerateEvaluationRequestSchema,
  type GenerationEvaluation,
} from '@/types'
import { evaluateGeneration } from '@/services/generation-evaluator.service'

interface GenerationEvaluateResponse {
  evaluation: GenerationEvaluation | null
}

export const POST = createApiRoute<
  typeof GenerateEvaluationRequestSchema,
  GenerationEvaluateResponse
>({
  schema: GenerateEvaluationRequestSchema,
  routeName: 'POST /api/generation/evaluate',
  handler: async (clerkId, data) => {
    const evaluation = await evaluateGeneration(clerkId, data.generationId)
    return { evaluation }
  },
})
