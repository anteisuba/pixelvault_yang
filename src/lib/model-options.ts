import { API_USAGE } from '@/constants/config'
import {
  getModelById,
  getModelMessageKey,
  isBuiltInModel,
} from '@/constants/models'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { UserApiKeyRecord } from '@/types'

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
 * Keep saved routes ahead of workspace defaults while preserving relative order.
 */
export function mergeModelOptionsWithSavedFirst(
  savedOptions: StudioModelOption[],
  workspaceOptions: StudioModelOption[],
): StudioModelOption[] {
  return [...savedOptions, ...workspaceOptions]
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
