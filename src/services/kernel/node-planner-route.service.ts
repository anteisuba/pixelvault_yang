import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  SCRIPT_PLANNER_PROVIDER_IDS,
  SCRIPT_PLANNER_MODELS,
  type ScriptPlannerConcreteProvider,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
import { ApiKeyError } from '@/lib/errors'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
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

  /**
   * 「自动」= **助手那一家、那个型号**（`resolveAssistantRoute`，owner 2026-10-15「全跟助手」）：
   * 与助手 chip 上写的是同一个答案，五家都能做（规划只要一段 JSON）。那一家没 key、那把 key
   * 解不开 → 照实抛，⛔ 不按顺序换一家花别家的钱。点名了 Gemini / DeepSeek / OpenAI 的照旧。
   */
  const assistant = await resolveAssistantRoute(userId)
  return {
    ...assistant.route,
    modelId: assistant.modelId,
    label: assistant.modelLabel,
  }
}
