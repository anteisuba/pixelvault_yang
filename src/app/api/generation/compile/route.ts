import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  GenerationCompileRequestSchema,
  type GenerationCompileResponse,
} from '@/types'
import {
  compileNegativePrompt,
  compilePrompt,
} from '@/services/prompt-compiler.service'

export const POST = createApiRoute<
  typeof GenerationCompileRequestSchema,
  GenerationCompileResponse
>({
  schema: GenerationCompileRequestSchema,
  routeName: 'POST /api/generation/compile',
  handler: async (_clerkId, data) => ({
    compiledPrompt: compilePrompt(data.intent, data.modelId),
    negativePrompt: compileNegativePrompt(data.intent, data.modelId),
  }),
})
