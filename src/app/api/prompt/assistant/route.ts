import { PromptAssistantRequestSchema } from '@/types'
import { chatPromptAssistant } from '@/services/kernel/prompt-assistant.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

/**
 * 与 `POST /api/prompt/assistant/stream` 同一个理由，见那条路由的注释。
 * ⚠ 这条是 JSON 信封（LoRA 转换轮），本来就没有流可言，整轮补全全在这个窗口里。
 */
export const maxDuration = 300

export const POST = createApiRoute({
  schema: PromptAssistantRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.promptAssistant,
  routeName: 'POST /api/prompt/assistant',
  handler: async (clerkId, data) => {
    return chatPromptAssistant(
      clerkId,
      data.messages,
      data.modelId,
      undefined,
      data.currentPrompt,
      data.apiKeyId,
      data.responseLanguage,
      data.mode,
      data.useInspirationContext,
      data.research,
      data.loraContext,
      data.references,
      data.assistantDomain,
      { researchMode: data.researchMode, llmModelId: data.llmModelId },
    )
  },
})
