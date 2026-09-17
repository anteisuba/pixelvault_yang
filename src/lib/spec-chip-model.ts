import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
} from '@/constants/provider-capabilities'
import { getVideoUnitPricePerSecond } from '@/constants/models/unit-prices'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  STUDIO_IMAGE_ASPECT_RATIOS,
  STUDIO_VIDEO_ASPECT_RATIOS,
} from '@/constants/studio'
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'
import {
  snapVideoDuration,
  snapVideoResolution,
} from '@/constants/video-model-capabilities'
import {
  isVideoResolution,
  type VideoResolution,
} from '@/constants/video-options'

/**
 * 规格 chip（D2 ④ / 进度表第 12 项）的**派生层**。
 *
 * 一颗 chip 回答「下一版长什么样」：比例 · 清晰度（· 时长）。档位**全部**从能力表
 * 派生 —— 图片读 `provider-capabilities` 的 `resolutionOptions`，视频读
 * `video-model-capabilities` 的 `supportedAspectRatios / supportedResolutions /
 * supportedDurations`。⛔ 这里不写模型名、不写 adapter 分支。
 *
 * 为什么是一层纯函数而不是 hook：同一颗 chip 有四个宿主（工作台图片 / 工作台视频 /
 * 画布图片卡 / 画布视频卡），前两个的值住在 `StudioFormContext`，后两个住在节点
 * 的 `params` 上。判据写在组件里必然分叉成四份。
 *
 * ⚠ 不支持的档**灰显划线而不是移除**：移除等于把「为什么不能选」变成谜，而这里的
 * 不可选是可解释的（这个模型最高 2K）。与「整段没有值域时不画那一段」是两件事。
 */

/** 图片清晰度的基础档。`auto` 只在模型确实声明时补在最前（Seedream 5.0）。 */
export const SPEC_IMAGE_RESOLUTION_TIERS = ['1K', '2K', '4K'] as const

/** 一段里的一格。`supported === false` = 灰显划线、不可点。 */
export interface SpecTier {
  readonly value: string
  readonly supported: boolean
}

export interface SpecResolutionTier extends SpecTier {
  /** 视频：该档的每秒单价（USD）。没核实过的渠道是 null；图片恒 null。 */
  readonly pricePerSecond: number | null
}

/**
 * 清晰度段标题右侧那行 mono 小字。⚠ 一次只写一件事：先说不支持的档，没有不支持的
 * 档才说价差 —— 两条并排会把一行小字挤成一句谁也读不完的话。
 */
export type SpecResolutionNote =
  | {
      readonly kind: 'unsupported'
      readonly tier: string
      /** 这个模型最高能到哪一档；不是「档位高于上限」时为 null。 */
      readonly maxSupported: string | null
    }
  | {
      readonly kind: 'priceDelta'
      readonly tier: string
      /** 相对当前档每秒贵多少（USD，恒为正）。 */
      readonly deltaPerSecond: number
    }

export interface SpecChipModel {
  readonly ratios: readonly SpecTier[]
  /**
   * 比例段被首帧锁住（禁用不移除）。判据由宿主给 —— 它同时要求「契约带图锁比例」
   * 与「首帧槽真的有图」，后者只有宿主知道。
   */
  readonly ratioLocked: boolean
  readonly resolutions: readonly SpecResolutionTier[]
  /** 视频时长档（整秒）。图片恒为空数组。 */
  readonly durations: readonly number[]
  /** 吸附到模型档位之后的秒数；没有时长段时为 null。 */
  readonly durationSeconds: number | null
  /** 当前清晰度档的每秒单价（USD）；缺价为 null。 */
  readonly pricePerSecond: number | null
  /** 这一枪的合计价 = 秒 × 每秒单价；缺价或没有时长段时为 null。 */
  readonly totalPrice: number | null
  /** chip 上那行全量摘要「比例 · 清晰度（· 时长）」。 */
  readonly summary: string
  readonly resolutionNote: SpecResolutionNote | null
  /** 三段全空 = 这个模型没有任何规格可调，宿主整颗 chip 不渲染。 */
  readonly isEmpty: boolean
}

/**
 * ⚠ 支持列表为空 = **整段不可用**（这条线路根本发不出这个字段），返回空数组让宿主
 * 整段不画。与「某一档灰掉」不是一回事：那是可解释的缺档，这是组级不存在。
 */
function tiersOf(
  universe: readonly string[],
  supported: readonly string[],
): readonly SpecTier[] {
  if (supported.length === 0) return []
  return universe.map((value) => ({
    value,
    supported: supported.includes(value),
  }))
}

/**
 * 段标题右侧那行小字。不支持的档优先；都支持时才找价差 —— 取有价的最贵一档与当前
 * 档的差。⚠ 两边都得有核实过的单价才算得出差，缺一个就什么都不说
 * （`unit-prices.ts` 的口径：宁可不显，不显一个推出来的数）。
 */
function resolveResolutionNote(
  resolutions: readonly SpecResolutionTier[],
  currentPrice: number | null,
): SpecResolutionNote | null {
  const supported = resolutions.filter((tier) => tier.supported)
  const unsupported = resolutions.find((tier) => !tier.supported)
  if (unsupported) {
    const highest = supported[supported.length - 1]
    const aboveCeiling =
      highest !== undefined &&
      resolutions.indexOf(unsupported) > resolutions.indexOf(highest)
    return {
      kind: 'unsupported',
      tier: unsupported.value,
      maxSupported: aboveCeiling ? highest.value : null,
    }
  }
  if (currentPrice === null) return null
  let dearest: SpecResolutionTier | null = null
  for (const tier of supported) {
    if (tier.pricePerSecond === null) continue
    if (dearest === null || tier.pricePerSecond > (dearest.pricePerSecond ?? 0))
      dearest = tier
  }
  if (!dearest || dearest.pricePerSecond === null) return null
  const delta = dearest.pricePerSecond - currentPrice
  if (delta <= 0) return null
  return { kind: 'priceDelta', tier: dearest.value, deltaPerSecond: delta }
}

/**
 * 摘要只印**确实在候选里**的值：能力表给的是 1K/2K/4K 而图片的默认值是 `auto`，
 * 不守卫就会印出一个弹层里根本点不到的「自动」。
 */
function buildSummary(input: {
  ratio: string | null
  resolution: string | null
  durationSeconds: number | null
}): string {
  return [
    input.ratio,
    input.resolution,
    input.durationSeconds === null ? null : `${input.durationSeconds}s`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * ⚠ 先问 adapter 在不在表里：`getCapabilityConfig` 直接下标一个 `Record`，认不出来
 * 的 adapter 会拿到 `undefined` 而它的签名说不会。
 */
function imageCapabilityOf(
  adapterType: AI_ADAPTER_TYPES | undefined,
  modelId: string | undefined,
) {
  if (!adapterType || !(adapterType in ADAPTER_CAPABILITIES)) return undefined
  return getCapabilityConfig(adapterType, modelId)
}

export interface ImageSpecChipInput {
  readonly adapterType: AI_ADAPTER_TYPES | undefined
  readonly modelId: string | undefined
  readonly aspectRatio: string | null
  readonly resolution: string | null
}

export function buildImageSpecChipModel(
  input: ImageSpecChipInput,
): SpecChipModel {
  const supportedResolutions =
    imageCapabilityOf(input.adapterType, input.modelId)?.resolutionOptions ?? []
  // `auto` 不在基础档里 —— 只有模型确实声明了它才补在最前，否则用户会看到一个
  // 谁都点不到的「自动」。
  const universe = supportedResolutions.includes('auto')
    ? (['auto', ...SPEC_IMAGE_RESOLUTION_TIERS] as readonly string[])
    : SPEC_IMAGE_RESOLUTION_TIERS
  const resolutions: readonly SpecResolutionTier[] =
    supportedResolutions.length === 0
      ? []
      : tiersOf(universe, supportedResolutions).map((tier) => ({
          ...tier,
          pricePerSecond: null,
        }))

  // 图片比例不随模型收窄：能力表里没有任何一家声明过比例值域，全仓的图片发送口
  // 读的都是 `STUDIO_IMAGE_ASPECT_RATIOS`。
  const ratios = tiersOf(STUDIO_IMAGE_ASPECT_RATIOS, STUDIO_IMAGE_ASPECT_RATIOS)
  const ratioValue =
    input.aspectRatio &&
    ratios.some((tier) => tier.value === input.aspectRatio && tier.supported)
      ? input.aspectRatio
      : null
  const resolutionValue =
    input.resolution &&
    resolutions.some(
      (tier) => tier.value === input.resolution && tier.supported,
    )
      ? input.resolution
      : null

  return {
    ratios,
    ratioLocked: false,
    resolutions,
    durations: [],
    durationSeconds: null,
    pricePerSecond: null,
    totalPrice: null,
    summary: buildSummary({
      ratio: ratioValue,
      resolution: resolutionValue,
      durationSeconds: null,
    }),
    resolutionNote: resolveResolutionNote(resolutions, null),
    isEmpty: ratios.length === 0 && resolutions.length === 0,
  }
}

export interface VideoSpecChipInput {
  readonly modelId: string | undefined
  /** 给了就按**这条端点的发送契约**收窄：契约发不出去的字段整段不画。 */
  readonly adapterType?: AI_ADAPTER_TYPES
  readonly aspectRatio: string | null
  readonly resolution: string | null
  readonly durationSeconds: number | null
  /** 首帧锁自适应：契约的 `imageAspectRatioLock` 非空 **且** 首帧槽真的有图。 */
  readonly aspectLocked?: boolean
}

export function buildVideoSpecChipModel(
  input: VideoSpecChipInput,
): SpecChipModel {
  if (!input.modelId) {
    return {
      ratios: [],
      ratioLocked: false,
      resolutions: [],
      durations: [],
      durationSeconds: null,
      pricePerSecond: null,
      totalPrice: null,
      summary: '',
      resolutionNote: null,
      isEmpty: true,
    }
  }

  // ⚠ 走**发送契约实算**的档位，不是裸能力表：这条端点发不出去的字段（Kling O3 的
  // video-to-video 三项全发不出去）在这里就是空数组，整段不画。
  const options = getVideoModelParameterOptions(
    input.modelId,
    input.adapterType,
  )
  const ratios = tiersOf(STUDIO_VIDEO_ASPECT_RATIOS, options.aspectRatios)
  // ⚠ 清晰度的值域**就是模型自己那几档**，不是全仓并集：并集会让每个模型都拖着
  // 两三个永远划线的档（540p / 2k 只有各一个生产者），那不是信息是噪音。比例不同
  // ——五档比例是同一套语义，缺哪一档本身就是该说的话。
  const modelId = input.modelId
  const resolutions: readonly SpecResolutionTier[] = options.resolutions
    .filter(isVideoResolution)
    .map((value) => ({
      value,
      supported: true,
      pricePerSecond: getVideoUnitPricePerSecond(modelId, value),
    }))

  const durations = options.durations
  const durationSeconds =
    durations.length === 0 || input.durationSeconds === null
      ? (durations[0] ?? null)
      : snapVideoDuration(input.modelId, input.durationSeconds)

  const resolutionValue =
    resolutions.length > 0 &&
    input.resolution &&
    isVideoResolution(input.resolution)
      ? snapVideoResolution(modelId, input.resolution)
      : null
  const pricePerSecond = resolutionValue
    ? getVideoUnitPricePerSecond(modelId, resolutionValue)
    : null

  const ratioLocked = input.aspectLocked === true
  const ratioValue =
    !ratioLocked &&
    input.aspectRatio &&
    ratios.some((tier) => tier.value === input.aspectRatio && tier.supported)
      ? input.aspectRatio
      : null

  return {
    ratios,
    ratioLocked,
    resolutions,
    durations,
    durationSeconds,
    pricePerSecond,
    totalPrice:
      pricePerSecond === null || durationSeconds === null
        ? null
        : pricePerSecond * durationSeconds,
    summary: buildSummary({
      ratio: ratioValue,
      resolution: resolutionValue,
      durationSeconds,
    }),
    resolutionNote: resolveResolutionNote(resolutions, pricePerSecond),
    isEmpty:
      ratios.length === 0 && resolutions.length === 0 && durations.length === 0,
  }
}

/** 视频清晰度的运行时收窄（宿主要拿它回写状态时用）。 */
export function asVideoResolution(value: string): VideoResolution | null {
  return isVideoResolution(value) ? value : null
}
