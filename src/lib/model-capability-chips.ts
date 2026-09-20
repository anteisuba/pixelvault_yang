import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
  getCapabilityFieldType,
  type CapabilityConfig,
  type NumericRange,
  type ProviderCapability,
} from '@/constants/provider-capabilities'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AdvancedParams } from '@/types'

/**
 * 能力驱动表单（D2 ④）的**派生层**：把 `provider-capabilities` 那张表翻译成
 * 「专属区」那一行 chip，以及切模型时该丢哪些值。
 *
 * ⚠ 这里是**唯一**知道「哪个能力长成哪种 chip」的地方。UI 里⛔不写模型名、
 * ⛔不写 adapter 分支 —— 画板的定案就是「专属能力只从能力表派生」。
 *
 * 为什么只留 slider / select / toggle 三种形态：
 * - `textarea`（negativePrompt）—— 图片与视频共用参数栏里那条折叠行，且 NAI 的
 *   UC 按 owner 批注 37 拆去 D2b，进这条 chip 行就等于把它提前画了。
 * - `seed` —— 画板 D2Spec 把 seed 放进**规格 chip 的「更多」**（第 12 项），
 *   不是专属行；owner 2026-08-22 也定过「图片工作台 seed 不介入」。
 * - `lora` —— LoRA 装配只在 LoRA 工作台（批注 38），工作台不给第二个入口。
 */
export type CapabilityChipKind = 'select' | 'slider' | 'toggle' | 'text'

export interface CapabilityChip {
  readonly capability: ProviderCapability
  readonly kind: CapabilityChipKind
  /** `select` 的候选；其余形态为 undefined。 */
  readonly options?: readonly string[]
  /** `slider` 的取值域；其余形态为 undefined。 */
  readonly range?: NumericRange
  /** `text` 的字数上限；其余形态为 undefined。 */
  readonly maxLength?: number
  /** 缺省值 —— chip 处在它上面时是「默认态」（白底描边），不是「选中」。 */
  readonly defaultValue: string | number | boolean
  /** 需要先挂参考图才成立（referenceStrength）：没挂时 chip 走 muted 灰底。 */
  readonly requiresReferenceImage: boolean
}

const CHIP_KINDS: readonly string[] = ['select', 'slider', 'toggle', 'text']

function isChipKind(kind: string | null): kind is CapabilityChipKind {
  return kind !== null && CHIP_KINDS.includes(kind)
}

const SELECT_OPTION_KEYS: Partial<
  Record<ProviderCapability, keyof CapabilityConfig>
> = {
  quality: 'qualityOptions',
  inputFidelity: 'inputFidelityOptions',
  background: 'backgroundOptions',
  style: 'styleOptions',
  qualityToggle: 'qualityToggleOptions',
  ucPreset: 'ucPresetOptions',
  sampler: 'samplerOptions',
  pixaiMode: 'pixaiModeOptions',
  pixaiSize: 'pixaiSizeOptions',
}

/**
 * 文本型能力 → 它的字数上限住在能力表的哪个键。没有上限的能力**不画** ——
 * 与 select 缺候选同理：一颗点开随便填、发出去被 provider 打回的 chip 比
 * 不画更糟。
 */
const TEXT_MAX_LENGTH_KEYS: Partial<
  Record<ProviderCapability, keyof CapabilityConfig>
> = {
  textRendering: 'textRenderingMaxChars',
}

/**
 * 无论哪个 provider 都只有挂了参考图才成立的能力：`referenceStrength` 要一张
 * 底图去 denoise，`inputFidelity` 只是 `/v1/images/edits` 的字段（纯文生图那条
 * 路上 OpenAI 根本不收）。没挂时 chip 走 muted 灰底，⛔ 不隐藏。
 *
 * ⚠ 只依赖参考图**在某些模型上**成立的能力不进这张表，写进能力表的
 * `referenceDependentCapabilities`（例：`background` 在 OpenAI 上文生图可用，
 * 在火山 Seedream 5.0 Pro 上文档写死「仅支持图生图场景」）。
 */
const REFERENCE_DEPENDENT_CAPABILITIES: ReadonlySet<ProviderCapability> =
  new Set<ProviderCapability>(['referenceStrength', 'inputFidelity'])

function isReferenceDependent(
  config: CapabilityConfig,
  capability: ProviderCapability,
): boolean {
  return (
    REFERENCE_DEPENDENT_CAPABILITIES.has(capability) ||
    (config.referenceDependentCapabilities?.includes(capability) ?? false)
  )
}

/**
 * 开关型能力。⚠ 这张表的用处只有一个：`pruneIncompatibleCapabilityValues` 要
 * 知道切模型时该检查哪些键。此前这里是硬写的 `['preview']`，于是新加一颗 toggle
 * 就会**静默漏掉** —— 切到不认它的模型后那个 `true` 会原样发给 provider。
 */
const TOGGLE_CAPABILITIES: readonly ProviderCapability[] = [
  'preview',
  'layerDecomposition',
]

const SLIDER_RANGE_KEYS: Partial<
  Record<ProviderCapability, keyof CapabilityConfig>
> = {
  guidanceScale: 'guidanceScale',
  steps: 'steps',
  referenceStrength: 'referenceStrength',
}

/**
 * ⚠ 先问 adapter 在不在表里：`getCapabilityConfig` 直接下标一个 `Record`，
 * 认不出来的 adapter 会拿到 `undefined` 而它的签名说不会。⛔ 不给不认识的
 * adapter 编一份能力。
 */
function resolve(
  adapterType: AI_ADAPTER_TYPES | undefined,
  modelId: string | undefined,
): CapabilityConfig | undefined {
  if (!adapterType || !(adapterType in ADAPTER_CAPABILITIES)) return undefined
  return getCapabilityConfig(adapterType, modelId)
}

/**
 * 当前模型的专属 chip 行。⚠ 返回空数组 = 这个模型**没有**专属能力，宿主整段
 * （虚线 + 小标 + chip 行）都不渲染 —— 画板上「专属 · 无」那一格已随批注撤下。
 */
export function getModelCapabilityChips(
  adapterType: AI_ADAPTER_TYPES | undefined,
  modelId?: string,
): readonly CapabilityChip[] {
  const config = resolve(adapterType, modelId)
  if (!config) return []

  const chips: CapabilityChip[] = []
  for (const capability of config.capabilities) {
    const kind = getCapabilityFieldType(capability)
    if (!isChipKind(kind)) continue

    if (kind === 'select') {
      const key = SELECT_OPTION_KEYS[capability]
      const options = key
        ? (config[key] as readonly string[] | undefined)
        : undefined
      // 声明了能力却没给候选 = 这一档在该模型上没有值域，画一颗点开是空的
      // chip 比不画更糟。
      if (!options?.length) continue
      chips.push({
        capability,
        kind,
        options,
        defaultValue: options[0],
        requiresReferenceImage: isReferenceDependent(config, capability),
      })
      continue
    }

    if (kind === 'slider') {
      const key = SLIDER_RANGE_KEYS[capability]
      const range = key ? (config[key] as NumericRange | undefined) : undefined
      if (!range) continue
      chips.push({
        capability,
        kind,
        range,
        defaultValue: range.default,
        requiresReferenceImage: isReferenceDependent(config, capability),
      })
      continue
    }

    if (kind === 'text') {
      const key = TEXT_MAX_LENGTH_KEYS[capability]
      const maxLength = key ? (config[key] as number | undefined) : undefined
      if (!maxLength) continue
      chips.push({
        capability,
        kind,
        maxLength,
        // 缺省是空串 = 不发这个字段。
        defaultValue: '',
        requiresReferenceImage: isReferenceDependent(config, capability),
      })
      continue
    }

    // toggle：缺省一律 false（不设 = 不发这个字段）。前置依旧逐模型判——
    // `layerDecomposition` 要一张待拆分图，`preview` 不要。
    chips.push({
      capability,
      kind,
      defaultValue: false,
      requiresReferenceImage: isReferenceDependent(config, capability),
    })
  }
  return chips
}

/** chip 当前落在哪个值上（没设过就是缺省值）。 */
export function getCapabilityChipValue(
  chip: CapabilityChip,
  params: AdvancedParams,
): string | number | boolean {
  const raw = params[chip.capability as keyof AdvancedParams]
  if (raw === undefined || raw === null) return chip.defaultValue
  if (chip.kind === 'toggle') return raw === true
  if (chip.kind === 'slider')
    return typeof raw === 'number' ? raw : chip.defaultValue
  return typeof raw === 'string' ? raw : chip.defaultValue
}

/** 是不是「选中态」（黑底白字）：值离开了缺省。 */
export function isCapabilityChipSet(
  chip: CapabilityChip,
  params: AdvancedParams,
): boolean {
  return getCapabilityChipValue(chip, params) !== chip.defaultValue
}

/**
 * 切模型时的静默回默认（画板「切模型 · 直接切」+ owner 批注 36）。
 *
 * 新模型不认识的专属键**整个删掉** —— 删掉就等于回到该能力的缺省值，⛔ 不写
 * 一份「上一个模型的快照」，也⛔ 不提示、不给撤销（批注 36 明确删掉了那条撤销条）。
 * 通用值（提示词 · 参考轨 · 规格 · 张数）不在这个函数的管辖内，一个都不碰。
 *
 * @returns 需要写回的新 params；**没有任何变化时返回 `null`**（宿主据此不
 *   dispatch —— 每次都返回新对象会把调用方的 effect 打成死循环）。
 */
export function pruneIncompatibleCapabilityValues(
  params: AdvancedParams,
  adapterType: AI_ADAPTER_TYPES | undefined,
  modelId?: string,
): AdvancedParams | null {
  const chips = getModelCapabilityChips(adapterType, modelId)
  const byCapability = new Map(chips.map((chip) => [chip.capability, chip]))

  const next: AdvancedParams = { ...params }
  let changed = false

  for (const capability of Object.keys(SELECT_OPTION_KEYS).concat(
    Object.keys(SLIDER_RANGE_KEYS),
    Object.keys(TEXT_MAX_LENGTH_KEYS),
    TOGGLE_CAPABILITIES,
  ) as ProviderCapability[]) {
    const key = capability as keyof AdvancedParams
    const current = next[key]
    if (current === undefined) continue

    const chip = byCapability.get(capability)
    const compatible = chip
      ? chip.kind === 'select'
        ? typeof current === 'string' && !!chip.options?.includes(current)
        : chip.kind === 'slider'
          ? typeof current === 'number' &&
            !!chip.range &&
            current >= chip.range.min &&
            current <= chip.range.max
          : chip.kind === 'text'
            ? typeof current === 'string' &&
              current.length <= (chip.maxLength ?? 0)
            : typeof current === 'boolean'
      : false

    if (compatible) continue
    delete next[key]
    changed = true
  }

  return changed ? next : null
}
