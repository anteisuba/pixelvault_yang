import 'server-only'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_LIMITS,
  SCRIPT_BREAKDOWN_ERROR_CODES,
  SCRIPT_BREAKDOWN_HTTP_STATUS,
  SCRIPT_BREAKDOWN_OUTPUT_CONTRACT,
  SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
  SCRIPT_PLANNER_PROVIDER_IDS,
  SCRIPT_PLANNER_MODELS,
  type ScriptPlannerConcreteProvider,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { ApiKeyError, ApiRequestError } from '@/lib/errors'
import { validateLlmStructuredOutput } from '@/lib/llm-output-validator'
import { withRetry } from '@/lib/with-retry'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { ensureUser } from '@/services/user.service'
import {
  ScriptBreakdownResultSchema,
  type ScriptBreakdownResponseData,
} from '@/types/script-breakdown'

interface PlannerRoute extends ResolvedLlmTextRoute {
  modelId: string
  label: string
}

function getAdapterForProvider(
  provider: ScriptPlannerConcreteProvider,
): AI_ADAPTER_TYPES {
  return SCRIPT_PLANNER_MODELS[provider].adapterType
}

async function resolveSpecificPlannerRoute(
  userId: string,
  provider: ScriptPlannerConcreteProvider,
  apiKeyId?: string,
): Promise<PlannerRoute> {
  if (apiKeyId) {
    const route = await resolveLlmTextRoute(userId, apiKeyId)
    const expectedAdapter = getAdapterForProvider(provider)
    if (route.adapterType !== expectedAdapter) {
      throw new ApiKeyError(
        'invalid',
        `The selected API key is not a ${SCRIPT_PLANNER_MODELS[provider].label} key.`,
      )
    }

    return {
      ...route,
      modelId: SCRIPT_PLANNER_MODELS[provider].modelId,
      label: SCRIPT_PLANNER_MODELS[provider].label,
    }
  }

  const adapterType = getAdapterForProvider(provider)
  const userKey = await findActiveKeyForAdapter(userId, adapterType)
  if (userKey) {
    return {
      adapterType: userKey.adapterType,
      providerConfig: userKey.providerConfig,
      apiKey: userKey.keyValue,
      modelId: SCRIPT_PLANNER_MODELS[provider].modelId,
      label: userKey.providerConfig.label,
    }
  }

  const platformKey = getSystemApiKey(adapterType)
  if (platformKey) {
    return {
      adapterType,
      providerConfig: getDefaultProviderConfig(adapterType),
      apiKey: platformKey,
      modelId: SCRIPT_PLANNER_MODELS[provider].modelId,
      label: SCRIPT_PLANNER_MODELS[provider].label,
    }
  }

  throw new ApiKeyError(
    'missing',
    `Please add a ${SCRIPT_PLANNER_MODELS[provider].label} API key to use script breakdown.`,
  )
}

async function resolvePlannerRoute(
  userId: string,
  provider: ScriptPlannerProvider,
  apiKeyId?: string,
): Promise<PlannerRoute> {
  if (provider !== SCRIPT_PLANNER_PROVIDER_IDS.auto) {
    return resolveSpecificPlannerRoute(userId, provider, apiKeyId)
  }

  if (apiKeyId) {
    const route = await resolveLlmTextRoute(userId, apiKeyId)
    if (
      route.adapterType !== AI_ADAPTER_TYPES.GEMINI &&
      route.adapterType !== AI_ADAPTER_TYPES.DEEPSEEK &&
      route.adapterType !== AI_ADAPTER_TYPES.OPENAI
    ) {
      throw new ApiKeyError(
        'invalid',
        'The selected API key does not support Node Studio script breakdown.',
      )
    }

    const providerEntry =
      route.adapterType === AI_ADAPTER_TYPES.OPENAI
        ? SCRIPT_PLANNER_MODELS.openai
        : route.adapterType === AI_ADAPTER_TYPES.DEEPSEEK
          ? SCRIPT_PLANNER_MODELS.deepseek
          : SCRIPT_PLANNER_MODELS.gemini

    return {
      ...route,
      modelId: providerEntry.modelId,
      label: route.providerConfig.label,
    }
  }

  const providerOrder = [
    SCRIPT_PLANNER_PROVIDER_IDS.gemini,
    SCRIPT_PLANNER_PROVIDER_IDS.deepseek,
    SCRIPT_PLANNER_PROVIDER_IDS.openai,
  ] as const
  const routeErrors: unknown[] = []

  for (const candidate of providerOrder) {
    try {
      return await resolveSpecificPlannerRoute(userId, candidate)
    } catch (error) {
      routeErrors.push(error)
      logger.info('Script breakdown planner route unavailable', {
        provider: candidate,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (routeErrors.every((error) => error instanceof ApiKeyError)) {
    throw new ApiKeyError(
      'missing',
      'Please add a Gemini, DeepSeek, or OpenAI API key to use script breakdown.',
    )
  }

  const lastError = routeErrors[routeErrors.length - 1]
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'No script breakdown route available.'))
}

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
  const route = await resolvePlannerRoute(
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
