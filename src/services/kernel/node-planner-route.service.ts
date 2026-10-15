import 'server-only'

import { ASSISTANT_PROVIDER_ORDER } from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  SCRIPT_PLANNER_PROVIDER_IDS,
  SCRIPT_PLANNER_MODELS,
  type ScriptPlannerConcreteProvider,
  type ScriptPlannerProvider,
} from '@/constants/script-breakdown'
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

/** 「自动」的顺序：`ASSISTANT_PROVIDER_ORDER` 里能做分镜规划的那几家，次序照抄。 */
const AUTO_PLANNER_PROVIDER_ORDER: readonly ScriptPlannerConcreteProvider[] =
  ASSISTANT_PROVIDER_ORDER.flatMap((adapterType) =>
    (
      Object.keys(SCRIPT_PLANNER_MODELS) as ScriptPlannerConcreteProvider[]
    ).filter(
      (provider) => SCRIPT_PLANNER_MODELS[provider].adapterType === adapterType,
    ),
  )

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
   * 「自动」= 助手那条顺序（`ASSISTANT_PROVIDER_ORDER`）里第一家配了 key、又能做分镜规划的
   * （owner 2026-10-15：全站只留一条顺序）。⚠ 只有「这家没 key」才看下一家；那把 key 解不开
   * 之类的错照实抛，⛔ 不悄悄换一家花别家的钱。
   */
  for (const candidate of AUTO_PLANNER_PROVIDER_ORDER) {
    try {
      return await resolveSpecificNodePlannerRoute(userId, candidate)
    } catch (error) {
      if (!(error instanceof ApiKeyError)) throw error
      logger.info('Node Studio planner route unavailable', {
        provider: candidate,
        reason: error.message,
      })
    }
  }

  throw new ApiKeyError(
    'missing',
    'Please add a Gemini, DeepSeek, or OpenAI API key to use Node Studio planning.',
  )
}
