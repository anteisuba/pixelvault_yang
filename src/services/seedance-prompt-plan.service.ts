import 'server-only'

import {
  SEEDANCE_PROMPT_PLAN_ERROR_CODES,
  SEEDANCE_PROMPT_PLAN_HTTP_STATUS,
  SEEDANCE_PROMPT_PLAN_LIMITS,
  SEEDANCE_PROMPT_PLAN_OUTPUT_CONTRACT,
  SEEDANCE_PROMPT_PLAN_OUTPUT_LANGUAGES,
  SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT,
} from '@/constants/seedance-prompt-plan'
import type { ScriptPlannerProvider } from '@/constants/script-breakdown'
import { logger } from '@/lib/logger'
import { ApiRequestError } from '@/lib/errors'
import type { AppLocale } from '@/i18n/routing'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import { withRetry } from '@/lib/with-retry'
import { llmTextCompletion } from '@/services/llm-text.service'
import { resolveNodePlannerRoute } from '@/services/node-planner-route.service'
import { ensureUser } from '@/services/user.service'
import {
  SeedancePromptPlanResultSchema,
  type SeedancePromptPlanResponseData,
} from '@/types/seedance-prompt-plan'

function getSeedancePromptOutputLanguage(locale: AppLocale): string {
  return SEEDANCE_PROMPT_PLAN_OUTPUT_LANGUAGES[locale]
}

function buildUserPrompt(idea: string, locale: AppLocale): string {
  const outputLanguage = getSeedancePromptOutputLanguage(locale)

  return [
    SEEDANCE_PROMPT_PLAN_OUTPUT_CONTRACT,
    `Limits: max ${SEEDANCE_PROMPT_PLAN_LIMITS.maxTimelineItems} timeline items. Keep finalPrompt under ${SEEDANCE_PROMPT_PLAN_LIMITS.finalPromptMaxLength} characters.`,
    `Locale hint: ${locale}. Keep JSON keys in English. Write every JSON string value in ${outputLanguage}, including title, visualDescription, timeline items, motion, camera, audioIntent, and finalPrompt. Preserve standard film/camera/style terms when they are clearer as industry terms. If the user explicitly asks for another output language, use that language instead.`,
    `User idea: ${idea}`,
  ].join('\n\n')
}

function createInvalidPlannerOutputError(): ApiRequestError {
  return new ApiRequestError(
    SEEDANCE_PROMPT_PLAN_ERROR_CODES.invalidPlannerOutput,
    SEEDANCE_PROMPT_PLAN_HTTP_STATUS.invalidPlannerOutput,
    'errors.provider.invalidStructuredOutput',
    'The selected planner model returned malformed Seedance prompt JSON. Retry or choose another Agent Key.',
  )
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw createInvalidPlannerOutputError()
    }

    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      throw createInvalidPlannerOutputError()
    }
  }
}

function validateSeedancePromptPlanOutput(rawOutput: string) {
  const validation = validateLlmStructuredOutput(
    parseJsonObject(rawOutput),
    SeedancePromptPlanResultSchema,
  )

  if (!validation.usable || !validation.data) {
    throw createInvalidPlannerOutputError()
  }

  return validation.data
}

function isSeedancePromptPlanRetryable(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return (
      error.errorCode ===
        SEEDANCE_PROMPT_PLAN_ERROR_CODES.invalidPlannerOutput ||
      error.httpStatus === SEEDANCE_PROMPT_PLAN_HTTP_STATUS.rateLimited ||
      error.httpStatus ===
        SEEDANCE_PROMPT_PLAN_HTTP_STATUS.temporarilyUnavailable
    )
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timed out') || message.includes('network')
  }

  return false
}

async function withSeedancePromptPlanTimeout<T>(task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Seedance prompt planning timed out. Please try again.'))
    }, SEEDANCE_PROMPT_PLAN_LIMITS.llmTimeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export async function createSeedancePromptPlan(
  clerkId: string,
  params: {
    idea: string
    plannerProvider: ScriptPlannerProvider
    apiKeyId?: string
    locale: AppLocale
  },
): Promise<SeedancePromptPlanResponseData> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveNodePlannerRoute(
    dbUser.id,
    params.plannerProvider,
    params.apiKeyId,
  )

  const plan = await withRetry(
    async () => {
      const rawOutput = await withSeedancePromptPlanTimeout(
        llmTextCompletion({
          systemPrompt: SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(params.idea, params.locale),
          modelId: route.modelId,
          maxTokens: SEEDANCE_PROMPT_PLAN_LIMITS.maxTokens,
          responseFormat: 'json_object',
          adapterType: route.adapterType,
          providerConfig: route.providerConfig,
          apiKey: route.apiKey,
        }),
      )

      return validateSeedancePromptPlanOutput(rawOutput)
    },
    {
      maxAttempts: 2,
      baseDelayMs: 800,
      label: 'seedance-prompt-plan.llm',
      isRetryable: isSeedancePromptPlanRetryable,
    },
  )

  logger.info('Seedance prompt plan generated', {
    adapterType: route.adapterType,
    modelId: route.modelId,
    timelineCount: plan.timeline.length,
  })

  return {
    plan,
    planner: {
      adapterType: route.adapterType,
      modelId: route.modelId,
      label: route.label,
    },
  }
}
