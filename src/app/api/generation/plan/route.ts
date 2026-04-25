import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerationPlanRequestSchema,
  type GenerationPlanResponse,
} from '@/types'
import { parseImageIntent } from '@/services/intent-parser.service'
import { routeModelsForIntent } from '@/services/model-router.service'
import {
  compilePrompt,
  compileNegativePrompt,
} from '@/services/prompt-compiler.service'

export const POST = createApiRoute<
  typeof GenerationPlanRequestSchema,
  GenerationPlanResponse
>({
  schema: GenerationPlanRequestSchema,
  routeName: 'POST /api/generation/plan',
  handler: async (_clerkId, data) => {
    const intent = await parseImageIntent(
      data.naturalLanguage,
      data.referenceAssets,
    )
    const recommendedModels = routeModelsForIntent(intent)
    const topModelId = recommendedModels[0]?.modelId ?? ''

    return {
      intent,
      recommendedModels,
      promptDraft: compilePrompt(intent, topModelId),
      negativePromptDraft: compileNegativePrompt(intent, topModelId),
      variationCount: 4,
    }
  },
})
