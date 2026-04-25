import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerationPlanRequestSchema,
  type GenerationPlanResponse,
  type ImageIntent,
} from '@/types'
import { parseImageIntent } from '@/services/intent-parser.service'
import { routeModelsForIntent } from '@/services/model-router.service'

function isPromptPart(value: string | undefined): value is string {
  return Boolean(value)
}

function buildPromptDraft(intent: ImageIntent): string {
  return [
    intent.subject,
    intent.subjectDetails,
    intent.actionOrPose,
    intent.scene,
    intent.composition,
    intent.camera,
    intent.lighting,
    intent.colorPalette,
    intent.style ? `${intent.style} style` : undefined,
    intent.mood ? `${intent.mood} mood` : undefined,
  ]
    .filter(isPromptPart)
    .join(', ')
}

function buildNegativePromptDraft(intent: ImageIntent): string | undefined {
  if (!intent.mustAvoid || intent.mustAvoid.length === 0) {
    return undefined
  }

  return intent.mustAvoid.join(', ')
}

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

    return {
      intent,
      recommendedModels,
      promptDraft: buildPromptDraft(intent),
      negativePromptDraft: buildNegativePromptDraft(intent),
      variationCount: 4,
    }
  },
})
