import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerationPlanRequestSchema,
  type GenerationPlanResponse,
} from '@/types'
import { parseImageIntent } from '@/services/intent-parser.service'
import {
  estimateModelCost,
  routeModelsForIntent,
} from '@/services/model-router.service'
import {
  compilePrompt,
  compileNegativePrompt,
} from '@/services/kernel/prompt-compiler.service'
import { ensureUser } from '@/services/user.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const POST = createApiRoute<
  typeof GenerationPlanRequestSchema,
  GenerationPlanResponse
>({
  schema: GenerationPlanRequestSchema,
  routeName: 'POST /api/generation/plan',
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    const intent = await parseImageIntent(
      data.naturalLanguage,
      data.referenceAssets,
    )
    const recommendedModels = await routeModelsForIntent(
      intent,
      data.preferences,
      { userId: user.id },
    )
    const topModelId = recommendedModels[0]?.modelId ?? ''
    const negativePrompt = compileNegativePrompt(intent, topModelId)

    return {
      intent,
      recommendedModels,
      promptDraft: compilePrompt(intent, topModelId),
      negativePrompt,
      negativePromptDraft: negativePrompt,
      estimatedCost: estimateModelCost(topModelId),
      variationCount: 4,
    }
  },
})
