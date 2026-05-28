import 'server-only'

import {
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_BREAKDOWN_ERROR_CODES,
  SCRIPT_BREAKDOWN_HTTP_STATUS,
  SCRIPT_BREAKDOWN_OUTPUT_CONTRACT,
  SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
import { logger } from '@/lib/logger'
import { ApiRequestError } from '@/lib/errors'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import { withRetry } from '@/lib/with-retry'
import { llmTextCompletion } from '@/services/llm-text.service'
import { resolveNodePlannerRoute } from '@/services/kernel/node-planner-route.service'
import { ensureUser } from '@/services/user.service'
import {
  ScriptBreakdownResultSchema,
  type ScriptBreakdownResponseData,
} from '@/types/script-breakdown'

function buildUserPrompt(idea: string, locale: string): string {
  return [
    SCRIPT_BREAKDOWN_OUTPUT_CONTRACT,
    `Limits: max ${SCRIPT_BREAKDOWN_LIMITS.maxCharacters} characters, ${SCRIPT_BREAKDOWN_LIMITS.maxScenes} scenes, ${SCRIPT_BREAKDOWN_LIMITS.maxActions} actions, ${SCRIPT_BREAKDOWN_LIMITS.maxBeats} beats, ${SCRIPT_BREAKDOWN_LIMITS.maxShots} shots.`,
    `Locale hint: ${locale}. Keep JSON keys in English; content may match the user's language.`,
    `User idea: ${idea}`,
  ].join('\n\n')
}

function createInvalidPlannerOutputError(): ApiRequestError {
  return new ApiRequestError(
    SCRIPT_BREAKDOWN_ERROR_CODES.invalidPlannerOutput,
    SCRIPT_BREAKDOWN_HTTP_STATUS.invalidPlannerOutput,
    'errors.provider.invalidStructuredOutput',
    'The selected planner model returned malformed JSON. Retry or choose another Agent Key.',
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

function validateScriptBreakdownOutput(rawOutput: string) {
  const validation = validateLlmStructuredOutput(
    parseJsonObject(rawOutput),
    ScriptBreakdownResultSchema,
  )

  if (!validation.usable || !validation.data) {
    throw createInvalidPlannerOutputError()
  }

  return validation.data
}

function isScriptBreakdownRetryable(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return (
      error.errorCode === SCRIPT_BREAKDOWN_ERROR_CODES.invalidPlannerOutput ||
      error.httpStatus === SCRIPT_BREAKDOWN_HTTP_STATUS.rateLimited ||
      error.httpStatus === SCRIPT_BREAKDOWN_HTTP_STATUS.temporarilyUnavailable
    )
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timed out') || message.includes('network')
  }

  return false
}

async function withScriptBreakdownTimeout<T>(task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Script breakdown timed out. Please try again.'))
    }, SCRIPT_BREAKDOWN_LIMITS.llmTimeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

export async function createScriptBreakdown(
  clerkId: string,
  params: {
    idea: string
    plannerProvider: ScriptPlannerProvider
    apiKeyId?: string
    locale: string
  },
): Promise<ScriptBreakdownResponseData> {
  const dbUser = await ensureUser(clerkId)
  const route = await resolveNodePlannerRoute(
    dbUser.id,
    params.plannerProvider,
    params.apiKeyId,
  )

  const breakdown = await withRetry(
    async () => {
      const rawOutput = await withScriptBreakdownTimeout(
        llmTextCompletion({
          systemPrompt: SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(params.idea, params.locale),
          modelId: route.modelId,
          maxTokens: SCRIPT_BREAKDOWN_LIMITS.maxTokens,
          responseFormat: 'json_object',
          adapterType: route.adapterType,
          providerConfig: route.providerConfig,
          apiKey: route.apiKey,
        }),
      )

      return validateScriptBreakdownOutput(rawOutput)
    },
    {
      maxAttempts: 2,
      baseDelayMs: 800,
      label: 'script-breakdown.llm',
      isRetryable: isScriptBreakdownRetryable,
    },
  )

  logger.info('Script breakdown generated', {
    adapterType: route.adapterType,
    modelId: route.modelId,
    characterCount: breakdown.characters.length,
    sceneCount: breakdown.scenes.length,
    shotCount: breakdown.shots.length,
  })

  return {
    breakdown,
    planner: {
      adapterType: route.adapterType,
      modelId: route.modelId,
      label: route.label,
    },
  }
}
