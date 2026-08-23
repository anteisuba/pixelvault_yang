'use client'

import { useMemo } from 'react'

import {
  adapterHasCapability,
  getLLMCapabilityScope,
  LLM_ENHANCE_ROUTE_MODELS,
  type LlmCapabilityScope,
} from '@/constants/llm-capability'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import { SCRIPT_PLANNER_MODELS } from '@/constants/script-breakdown'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { ApiKeyHealthStatus } from '@/types'

export interface LLMRouteOption {
  optionId: string
  apiKeyId: string | null
  adapterType: AI_ADAPTER_TYPES
  modelId?: string
  label: string
  providerLabel: string
  maskedKey?: string
  keyLabel?: string
  isSaved: boolean
}

export interface UseLLMRoutePickerReturn {
  savedRoutes: LLMRouteOption[]
  lockedRoutes: LLMRouteOption[]
  allRoutes: LLMRouteOption[]
  healthMap: Record<string, ApiKeyHealthStatus>
}

/**
 * All tiers an adapter offers in this scope, registry order preserved (the
 * first entry is the adapter's default tier — same rule the server applies in
 * resolveAssistantModelId). One adapter may expose several modelIds since
 * 2026-08-23 (e.g. GPT-5.6 sol/terra/luna).
 */
function getRegistryEntries(
  scope: LlmCapabilityScope,
  adapterType: AI_ADAPTER_TYPES,
): Array<{ modelId: string; label: string }> {
  switch (scope) {
    case 'planner':
      return Object.values(SCRIPT_PLANNER_MODELS)
        .filter((m) => m.adapterType === adapterType)
        .map((m) => ({ modelId: m.modelId, label: m.label }))
    case 'assistant':
      return NODE_STUDIO_ASSISTANT_ROUTE_MODELS.filter(
        (m) => m.adapterType === adapterType,
      ).map((m) => ({ modelId: m.modelId, label: m.label }))
    case 'enhance':
      return LLM_ENHANCE_ROUTE_MODELS.filter(
        (m) => m.adapterType === adapterType,
      ).map((m) => ({ modelId: m.modelId, label: m.label }))
  }
}

export function useLLMRoutePicker(
  scope: LlmCapabilityScope,
): UseLLMRoutePickerReturn {
  const { keys, healthMap } = useApiKeysContext()

  const savedRoutes = useMemo<LLMRouteOption[]>(() => {
    return keys
      .filter((k) => k.isActive && adapterHasCapability(k.adapterType, scope))
      .flatMap((k) =>
        // One key × N tiers → N options. optionId carries the modelId so two
        // tiers of the same key stay distinct selections.
        getRegistryEntries(scope, k.adapterType).map((registry) => ({
          optionId: `llm-route:${scope}:key:${k.id}:${registry.modelId}`,
          apiKeyId: k.id,
          adapterType: k.adapterType,
          modelId: registry.modelId,
          label: registry.label,
          providerLabel: getProviderLabel(k.providerConfig),
          maskedKey: k.maskedKey,
          keyLabel: k.label,
          isSaved: true,
        })),
      )
  }, [keys, scope])

  const lockedRoutes = useMemo<LLMRouteOption[]>(() => {
    return getLLMCapabilityScope(scope).flatMap((adapterType) =>
      getRegistryEntries(scope, adapterType).map((registry) => ({
        optionId: `llm-route:${scope}:setup:${registry.modelId}`,
        apiKeyId: null,
        adapterType,
        modelId: registry.modelId,
        label: registry.label,
        providerLabel: getProviderLabel(getDefaultProviderConfig(adapterType)),
        isSaved: false,
      })),
    )
  }, [scope])

  const allRoutes = useMemo<LLMRouteOption[]>(
    () => [...savedRoutes, ...lockedRoutes],
    [savedRoutes, lockedRoutes],
  )

  return { savedRoutes, lockedRoutes, allRoutes, healthMap }
}
