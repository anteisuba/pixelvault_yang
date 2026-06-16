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

function getRegistryEntry(
  scope: LlmCapabilityScope,
  adapterType: AI_ADAPTER_TYPES,
): { modelId: string; label: string } | null {
  switch (scope) {
    case 'planner': {
      const entry = Object.values(SCRIPT_PLANNER_MODELS).find(
        (m) => m.adapterType === adapterType,
      )
      return entry ? { modelId: entry.modelId, label: entry.label } : null
    }
    case 'assistant': {
      const entry = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
        (m) => m.adapterType === adapterType,
      )
      return entry ? { modelId: entry.modelId, label: entry.label } : null
    }
    case 'enhance': {
      const entry = LLM_ENHANCE_ROUTE_MODELS.find(
        (m) => m.adapterType === adapterType,
      )
      return entry ? { modelId: entry.modelId, label: entry.label } : null
    }
  }
}

export function useLLMRoutePicker(
  scope: LlmCapabilityScope,
): UseLLMRoutePickerReturn {
  const { keys, healthMap } = useApiKeysContext()

  const savedRoutes = useMemo<LLMRouteOption[]>(() => {
    return keys
      .filter((k) => k.isActive && adapterHasCapability(k.adapterType, scope))
      .map((k) => {
        const registry = getRegistryEntry(scope, k.adapterType)
        return {
          optionId: `llm-route:${scope}:key:${k.id}`,
          apiKeyId: k.id,
          adapterType: k.adapterType,
          modelId: registry?.modelId,
          label: registry?.label ?? k.adapterType,
          providerLabel: getProviderLabel(k.providerConfig),
          maskedKey: k.maskedKey,
          keyLabel: k.label,
          isSaved: true,
        }
      })
  }, [keys, scope])

  const lockedRoutes = useMemo<LLMRouteOption[]>(() => {
    return getLLMCapabilityScope(scope).map((adapterType) => {
      const registry = getRegistryEntry(scope, adapterType)
      return {
        optionId: registry
          ? `llm-route:${scope}:setup:${registry.modelId}`
          : `llm-route:${scope}:setup-adapter:${adapterType}`,
        apiKeyId: null,
        adapterType,
        modelId: registry?.modelId,
        label: registry?.label ?? adapterType,
        providerLabel: getProviderLabel(getDefaultProviderConfig(adapterType)),
        isSaved: false,
      }
    })
  }, [scope])

  const allRoutes = useMemo<LLMRouteOption[]>(
    () => [...savedRoutes, ...lockedRoutes],
    [savedRoutes, lockedRoutes],
  )

  return { savedRoutes, lockedRoutes, allRoutes, healthMap }
}
