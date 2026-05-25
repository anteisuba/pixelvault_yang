import 'server-only'

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  SCRIPT_PLANNER_PROVIDER_IDS,
  SCRIPT_PLANNER_MODELS,
  type ScriptPlannerConcreteProvider,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { ApiKeyError } from '@/lib/errors'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'

export interface NodePlannerRoute extends ResolvedLlmTextRoute {
  modelId: string
  label: string
}

function getAdapterForProvider(
  provider: ScriptPlannerConcreteProvider,
): AI_ADAPTER_TYPES {
  return SCRIPT_PLANNER_MODELS[provider].adapterType
}

async function resolveSpecificNodePlannerRoute(
  userId: string,
  provider: ScriptPlannerConcreteProvider,
  apiKeyId?: string,
): Promise<NodePlannerRoute> {
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
    `Please add a ${SCRIPT_PLANNER_MODELS[provider].label} API key to use Node Studio planning.`,
  )
}

export async function resolveNodePlannerRoute(
  userId: string,
  provider: ScriptPlannerProvider,
  apiKeyId?: string,
): Promise<NodePlannerRoute> {
  if (provider !== SCRIPT_PLANNER_PROVIDER_IDS.auto) {
    return resolveSpecificNodePlannerRoute(userId, provider, apiKeyId)
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
        'The selected API key does not support Node Studio planning.',
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
      return await resolveSpecificNodePlannerRoute(userId, candidate)
    } catch (error) {
      routeErrors.push(error)
      logger.info('Node Studio planner route unavailable', {
        provider: candidate,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (routeErrors.every((error) => error instanceof ApiKeyError)) {
    throw new ApiKeyError(
      'missing',
      'Please add a Gemini, DeepSeek, or OpenAI API key to use Node Studio planning.',
    )
  }

  const lastError = routeErrors[routeErrors.length - 1]
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'No Node Studio planner route available.'))
}
