import { API_USAGE } from '@/constants/config'
import {
  getModelById,
  getModelMessageKey,
  isBuiltInModel,
} from '@/constants/models'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

const API_KEY_HEALTH_PRIORITY: Record<ApiKeyHealthStatus, number> = {
  available: 0,
  no_key: 2,
  failed: 3,
}

const UNKNOWN_API_KEY_HEALTH_PRIORITY = 1

/**
 * Build saved model options from user's active API keys.
 * Shared by GenerateForm, VideoGenerateForm, and ArenaForm.
 */
export function buildSavedModelOptions(
  keys: UserApiKeyRecord[],
  filter?: (key: UserApiKeyRecord) => boolean,
): StudioModelOption[] {
  const filtered = filter ? keys.filter(filter) : keys
  return filtered.map((key) => ({
    optionId: `key:${key.id}`,
    modelId: key.modelId,
    adapterType: key.adapterType,
    providerConfig: key.providerConfig,
    requestCount:
      getModelById(key.modelId)?.cost ??
      API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    isBuiltIn: isBuiltInModel(key.modelId),
    sourceType: 'saved' as const,
    keyId: key.id,
    keyLabel: key.label,
    maskedKey: key.maskedKey,
  }))
}

/**
 * Sort saved routes so verified healthy keys stay easiest to reach.
 */
export function sortSavedModelOptionsByHealth(
  savedOptions: StudioModelOption[],
  healthMap: Partial<Record<string, ApiKeyHealthStatus>>,
): StudioModelOption[] {
  const getHealthPriority = (keyId?: string): number => {
    if (!keyId) {
      return UNKNOWN_API_KEY_HEALTH_PRIORITY
    }

    const healthStatus = healthMap[keyId]
    return healthStatus != null
      ? API_KEY_HEALTH_PRIORITY[healthStatus]
      : UNKNOWN_API_KEY_HEALTH_PRIORITY
  }

  return [...savedOptions].sort((left, right) => {
    const leftPriority = getHealthPriority(left.keyId)
    const rightPriority = getHealthPriority(right.keyId)

    return leftPriority - rightPriority
  })
}

/**
 * Show verified saved routes first, keep workspace defaults in the middle,
 * and leave unhealthy / unknown saved routes accessible afterwards.
 */
export function mergeModelOptionsWithPreferredSavedRoutes(
  savedOptions: StudioModelOption[],
  workspaceOptions: StudioModelOption[],
  healthMap: Partial<Record<string, ApiKeyHealthStatus>>,
): StudioModelOption[] {
  const getSavedOptionHealthStatus = (
    option: StudioModelOption,
  ): ApiKeyHealthStatus | undefined =>
    option.keyId ? healthMap[option.keyId] : undefined

  const sortedSavedOptions = sortSavedModelOptionsByHealth(
    savedOptions,
    healthMap,
  )
  const preferredSavedOptions = sortedSavedOptions.filter(
    (option) => getSavedOptionHealthStatus(option) === 'available',
  )
  const fallbackSavedOptions = sortedSavedOptions.filter(
    (option) => getSavedOptionHealthStatus(option) !== 'available',
  )

  return [
    ...preferredSavedOptions,
    ...workspaceOptions,
    ...fallbackSavedOptions,
  ]
}

/**
 * Find the selected model from options, falling back to first option.
 */
export function findSelectedModel<T extends { optionId: string }>(
  options: T[],
  selectedOptionId: string,
): T | undefined {
  return options.find((o) => o.optionId === selectedOptionId) ?? options[0]
}

/**
 * Get translated model label for display.
 */
export function getTranslatedModelLabel(
  tModels: (key: string, values?: Record<string, string | number>) => string,
  modelId: string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }
  return modelId
}
