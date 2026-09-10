import type { StudioModelOption } from '@/components/business/ModelSelector'
import { getModelFamily, getModelVariant } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'

/**
 * 方案 A 的列表形状：**系列 → 型号 → 渠道[]**（`node-canvas-v2.md` §1.6）。
 *
 * 与三层钻取（`BaseModelPickerPanel`）的区别不在数据，而在呈现：那边一次看一层，
 * 这边一屏摊平 —— 系列退成分组标题，型号是行，渠道收进行尾的「N 渠道」。
 * 所以分组逻辑抽成纯函数，i18n 与交互留给组件。
 */

export interface PickerChannel {
  /** = `option.optionId`，与 `resolveModelChannel` 的 `channelId` 同一个东西。 */
  channelId: string
  label: string
  option: StudioModelOption
}

export interface PickerModel {
  /** 型号键（`MODEL_VARIANTS`，没登记的以 modelId 自成一型号）。 */
  modelKey: string
  /** 型号名，已削掉「（BytePlus）」这类渠道后缀，见 `deriveModelLabels`。 */
  label: string
  channels: PickerChannel[]
}

export interface PickerSeries {
  seriesKey: string
  /** 分组标题（系列名；目录外的 id 退回渠道名）。 */
  label: string
  models: PickerModel[]
}

/** 结尾的括注（半角/全角都算），如 `Seedream 5.0 Pro（BytePlus）` 的那一段。 */
const TRAILING_QUALIFIER = /[（(][^（()）]*[)）]\s*$/

function seriesKeyOf(option: StudioModelOption): string {
  const family = getModelFamily(option.modelId)
  return family ? `family:${family}` : `provider:${option.adapterType}`
}

function seriesLabelOf(option: StudioModelOption): string {
  return (
    getModelFamily(option.modelId) ?? getProviderLabel(option.providerConfig)
  )
}

function modelKeyOf(option: StudioModelOption): string {
  return getModelVariant(option.modelId) ?? option.modelId
}

function routeKey(option: StudioModelOption): string {
  return `${option.adapterType}::${option.modelId}`
}

/**
 * 同一条路由既有 `key:<id>` 又有 `workspace:<modelId>` 时只留 key 那条 ——
 * 它在提交时钉住 `apiKeyId`，还带着 key 标签与健康点，留下 workspace 双胞胎
 * 会在渠道单选里画出两行一模一样的字。`freeTier` 的双胞胎**不是**冗余：它走
 * 平台额度，不花用户的 key，收掉等于拿走更便宜的那条。
 */
function dedupeRedundantRoutes(
  options: readonly StudioModelOption[],
): StudioModelOption[] {
  const keyed = new Set(
    options.filter((o) => o.sourceType === 'saved').map(routeKey),
  )
  if (keyed.size === 0) return [...options]
  return options.filter(
    (o) => o.sourceType === 'saved' || o.freeTier || !keyed.has(routeKey(o)),
  )
}

/**
 * 一族里每个型号显示什么名字 —— **整族一起算**，单个型号自己定不了。
 *
 * 取族内最短的那条标签再削掉结尾括注；⚠ **削与不削的判据是「削完在本族里还
 * 唯一吗」**，不是「这个型号有几个条目」：`Seedream 5.0 Pro（火山方舟）` 是
 * 单条目，削完会与 fal 那条同名，就不能削。
 */
export function deriveModelLabels(
  models: readonly { modelKey: string; labels: readonly string[] }[],
): Map<string, string> {
  const shortest = new Map<string, string>()
  const stripped = new Map<string, string>()
  const strippedUses = new Map<string, number>()

  for (const { modelKey, labels } of models) {
    const short = labels.length
      ? labels.reduce((a, b) => (b.length < a.length ? b : a))
      : ''
    const bare = short.replace(TRAILING_QUALIFIER, '').trim() || short
    shortest.set(modelKey, short)
    stripped.set(modelKey, bare)
    strippedUses.set(bare, (strippedUses.get(bare) ?? 0) + 1)
  }

  return new Map(
    models.map(({ modelKey }) => {
      const bare = stripped.get(modelKey) ?? ''
      const unique = (strippedUses.get(bare) ?? 0) === 1
      return [modelKey, unique ? bare : (shortest.get(modelKey) ?? bare)]
    }),
  )
}

/**
 * 分组本体。顺序跟着传进来的清单走（那份已经按偏好排过），不再二次排序。
 *
 * `labelOf` 是型号名的来源（i18n 在组件里），本函数只负责按族去重后缀。
 */
export function groupModelsForPicker(
  options: readonly StudioModelOption[],
  labelOf: (option: StudioModelOption) => string,
): PickerSeries[] {
  const display = dedupeRedundantRoutes(options)

  const bySeries = new Map<string, StudioModelOption[]>()
  for (const option of display) {
    const key = seriesKeyOf(option)
    const list = bySeries.get(key) ?? []
    list.push(option)
    bySeries.set(key, list)
  }

  return Array.from(bySeries, ([seriesKey, seriesOptions]) => {
    const byModel = new Map<string, StudioModelOption[]>()
    for (const option of seriesOptions) {
      const key = modelKeyOf(option)
      const list = byModel.get(key) ?? []
      list.push(option)
      byModel.set(key, list)
    }
    const raw = Array.from(byModel, ([modelKey, modelOptions]) => ({
      modelKey,
      labels: modelOptions.map(labelOf),
      options: modelOptions,
    }))
    const labels = deriveModelLabels(raw)

    return {
      seriesKey,
      label: seriesLabelOf(seriesOptions[0]),
      models: raw.map(({ modelKey, options: modelOptions }) => ({
        modelKey,
        label: labels.get(modelKey) ?? modelKey,
        channels: modelOptions.map((option) => ({
          channelId: option.optionId,
          label: getProviderLabel(option.providerConfig),
          option,
        })),
      })),
    }
  })
}

/** 摊平成型号列表 —— 搜索与「最近」都按型号走，不按系列。 */
export function flattenPickerModels(series: readonly PickerSeries[]): {
  series: PickerSeries
  model: PickerModel
}[] {
  return series.flatMap((s) => s.models.map((model) => ({ series: s, model })))
}
