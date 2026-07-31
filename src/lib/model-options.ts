import { API_USAGE } from '@/constants/config'
import {
  getModelById,
  getModelMessageKey,
  isBuiltInModel,
  type ModelOption,
} from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

const API_KEY_HEALTH_PRIORITY: Record<ApiKeyHealthStatus, number> = {
  available: 0,
  unknown: 1,
  no_key: 2,
  failed: 3,
}

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

export function apiKeyMatchesModelOption(
  key: UserApiKeyRecord,
  model: ModelOption,
): boolean {
  return (
    model.available &&
    model.id === key.modelId &&
    model.adapterType === key.adapterType
  )
}

export function apiKeyMatchesAnyModelOption(
  key: UserApiKeyRecord,
  models: readonly ModelOption[],
): boolean {
  return models.some((model) => apiKeyMatchesModelOption(key, model))
}

export function buildSavedModelOptionsForModels(
  keys: UserApiKeyRecord[],
  models: readonly ModelOption[],
): StudioModelOption[] {
  return buildSavedModelOptions(keys, (key) =>
    apiKeyMatchesAnyModelOption(key, models),
  )
}

/**
 * The active key each adapter would actually run on, mirroring
 * `findActiveKeyForAdapter` (most recently created active key wins).
 */
function pickActiveKeyPerAdapter(
  keys: UserApiKeyRecord[],
): Map<AI_ADAPTER_TYPES, UserApiKeyRecord> {
  const byAdapter = new Map<AI_ADAPTER_TYPES, UserApiKeyRecord>()
  for (const key of keys) {
    if (!key.isActive) continue
    const current = byAdapter.get(key.adapterType)
    if (!current || key.createdAt > current.createdAt) {
      byAdapter.set(key.adapterType, key)
    }
  }
  return byAdapter
}

/**
 * Stamp `providerKeyId` on workspace options whose provider is already keyed.
 *
 * Provider keys are universal within their adapter type — `resolveGenerationRoute`
 * validates only that the key's adapter matches the model's, and the
 * no-apiKeyId path resolves through `findActiveKeyForAdapter(userId, adapterType)`,
 * which ignores modelId entirely. One saved fal key therefore runs every fal
 * model, whatever modality or model id it happened to be saved under.
 *
 * Without this stamp the pickers read "runnable" off `sourceType === 'saved'`,
 * which is one option per saved KEY ROW (unique per user × adapter × model). A
 * user holding a single fal key bound to Seedance saw every other fal model
 * filed under 需要 API key — and `BaseModelPickerPanel` then hid the whole
 * bucket, so the fal group listed 1 of its 8 options.
 *
 * `freeTier` options are left untouched: platform quota still outranks burning
 * the user's own key, and `useSplitModelOptions` checks freeTier first.
 */
export function withProviderKeyCoverage<T extends StudioModelOption>(
  options: T[],
  keys: UserApiKeyRecord[],
): T[] {
  const keyByAdapter = pickActiveKeyPerAdapter(keys)
  if (keyByAdapter.size === 0) return options

  return options.map((option) => {
    if (option.sourceType === 'saved') return option
    const providerKey = keyByAdapter.get(option.adapterType)
    return providerKey ? { ...option, providerKeyId: providerKey.id } : option
  })
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
      return API_KEY_HEALTH_PRIORITY.unknown
    }

    const healthStatus = healthMap[keyId]
    return healthStatus != null
      ? API_KEY_HEALTH_PRIORITY[healthStatus]
      : API_KEY_HEALTH_PRIORITY.unknown
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
