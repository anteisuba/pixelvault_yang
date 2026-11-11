import { API_USAGE } from '@/constants/config'
import {
  getModelById,
  getModelMessageKey,
  isBuiltInModel,
  type ModelOption,
} from '@/constants/models'
import {
  BYTEDANCE_ARK_ADAPTERS,
  isBytedanceArkAdapter,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'
import { getBytedanceStationTwin } from '@/lib/bytedance-stations'
import { pickDefaultApiKey } from '@/lib/pick-default-api-key'

const API_KEY_HEALTH_PRIORITY: Record<ApiKeyHealthStatus, number> = {
  available: 0,
  unknown: 1,
  no_key: 2,
  failed: 3,
}

/**
 * Build saved model options from user's active API keys.
 * Shared by GenerateForm and VideoGenerateForm.
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
 * filed under 需要 API key — and the picker then showed a yellow dot on every
 * one of them, so a fal group of 8 read as 7 unconfigured routes.
 *
 */
export function withProviderKeyCoverage<T extends StudioModelOption>(
  options: T[],
  keys: UserApiKeyRecord[],
): T[] {
  const stationOptions = foldBytedanceStations(options, keys)
  const keyByAdapter = pickActiveKeyPerAdapter(keys)
  if (keyByAdapter.size === 0) return stationOptions

  return stationOptions.map((option) => {
    if (option.sourceType === 'saved') return option
    const providerKey = keyByAdapter.get(option.adapterType)
    return providerKey ? { ...option, providerKeyId: providerKey.id } : option
  })
}

/**
 * 字节两站合一（owner 2026-11-11，`docs/design/bytedance-channel.md`）：同一型号
 * 两站各有一条时**只留默认站那条**，另一站只留它独有的型号。默认站 = 字节 key
 * 里标为默认的那把所在的站（`pickDefaultApiKey`）；一把字节 key 都没有时按
 * `BYTEDANCE_ARK_ADAPTERS` 第一站。
 *
 * ⭐ 折在目录这一层：选择器、出图名单、算钱、助手换模型读的都是这一份，跑哪站
 * 与显示哪站永远一致。存下来的旧站 optionId 由 `findOptionById` 落到同款上。
 */
export function foldBytedanceStations<T extends StudioModelOption>(
  options: readonly T[],
  keys: readonly UserApiKeyRecord[],
): T[] {
  const arkKeys = keys.filter(
    (key) => key.isActive && isBytedanceArkAdapter(key.adapterType),
  )
  const defaultStation =
    pickDefaultApiKey(arkKeys)?.adapterType ?? BYTEDANCE_ARK_ADAPTERS[0]
  const present = new Set(options.map((option) => option.modelId))
  return options.filter((option) => {
    if (!isBytedanceArkAdapter(option.adapterType)) return true
    if (option.adapterType === defaultStation) return true
    const twin = getBytedanceStationTwin(option.modelId)
    return !twin || !present.has(twin)
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

/** 一条**路由**的身份：adapter + 型号。⛔ 不含 optionId —— 同一条路可以有两个。 */
function routeKeyOf(option: StudioModelOption): string {
  return `${option.adapterType}::${option.modelId}`
}

/**
 * 同一条路既有 `key:<id>` 又有 `workspace:<modelId>` 时**只留 key 那条**。
 *
 * ⭐ 这是**路由身份的唯一一份定义**（选择器此前自己揣了一份，于是目录里躺着
 * 两个 optionId、而选择器只认得其中一个）。真机 2026-09-20 撞到的后果：
 * 默认模型落在 `workspace:` 那一条上，选择器的行只认得 `key:` 那一条 ——
 * 行不知道自己已被选中，再点一次走的是「新增」而不是「取消」，**同一个模型
 * 进名单两份，按两份跑、按两份计费**。
 *
 * ⛔ 修法不能是「渲染时去重」：名单里仍旧躺着两份，裁剪 payload 与算钱的地方
 * 照样看到两个。折在目录这一层，**出图跑哪份、选择器点亮哪份就永远是同一份**。
 *
 * 留 key 那条而不是 workspace：它提交时钉住 `apiKeyId`，还带着 key 标签与健康点。
 */
export function foldRedundantWorkspaceRoutes<T extends StudioModelOption>(
  options: readonly T[],
): T[] {
  const keyed = new Set(
    options.filter((o) => o.sourceType === 'saved').map(routeKeyOf),
  )
  if (keyed.size === 0) return [...options]
  return options.filter(
    (o) => o.sourceType === 'saved' || !keyed.has(routeKeyOf(o)),
  )
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

  // ⚠ 折在**返回之前**：这份名单是目录本身，下游（默认模型 / 出图名单 / 成本 /
  // 选择器）读的都是它。折在任何一个下游都会让其余几个继续看到两份。
  return foldRedundantWorkspaceRoutes([
    ...preferredSavedOptions,
    ...workspaceOptions,
    ...fallbackSavedOptions,
  ])
}

/**
 * Find the selected model from options, falling back to first option.
 */
export function findSelectedModel<
  T extends { optionId: string; modelId: string },
>(options: T[], selectedOptionId: string): T | undefined {
  return findOptionById(options, selectedOptionId) ?? options[0]
}

const WORKSPACE_OPTION_PREFIX = 'workspace:'

/**
 * 按 modelId 找目录里那一条。字节被折掉的那站（`foldBytedanceStations`）落到它在
 * 另一站的同款 —— 助手点名、重跑旧生成拿着的可能是旧站的 id。
 */
export function findOptionByModelId<T extends { modelId: string }>(
  options: readonly T[],
  modelId: string,
): T | undefined {
  const exact = options.find((option) => option.modelId === modelId)
  if (exact) return exact
  const twin = getBytedanceStationTwin(modelId)
  return twin ? options.find((option) => option.modelId === twin) : undefined
}

/**
 * 按 optionId 找。存下来的 `workspace:<字节型号>` 在换了默认站之后已被折掉，
 * 落到另一站的同款，⛔ 不悄悄丢掉用户选过的型号。
 */
export function findOptionById<T extends { optionId: string; modelId: string }>(
  options: readonly T[],
  optionId: string,
): T | undefined {
  const exact = options.find((option) => option.optionId === optionId)
  if (exact) return exact
  if (!optionId.startsWith(WORKSPACE_OPTION_PREFIX)) return undefined
  const twin = getBytedanceStationTwin(
    optionId.slice(WORKSPACE_OPTION_PREFIX.length),
  )
  return twin ? options.find((option) => option.modelId === twin) : undefined
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

/**
 * 模型的一句话介绍 —— 目录里 61 个模型**全都有** `description`，此前只是没有地方
 * 显示。模型选择器把它收进悬停展开层（行内只留型号与渠道）。
 *
 * 目录外的 id（LLM 路由、EDIT_MODELS 那类）没有这条消息 → 返回 undefined，调用方
 * 应当**不渲染那一层**，而不是显示一个空盒子或原样 key。
 */
export function getTranslatedModelDescription(
  tModels: (key: string, values?: Record<string, string | number>) => string,
  modelId: string,
): string | undefined {
  if (!isBuiltInModel(modelId)) return undefined
  const key = `${getModelMessageKey(modelId)}.description`
  const value = tModels(key)
  // next-intl 解析不到时回落成 key 本身；那不是文案，别显示给用户。
  return value && value !== key && !value.endsWith('.description')
    ? value
    : undefined
}
