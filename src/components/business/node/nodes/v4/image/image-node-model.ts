/**
 * 图片节点的**纯读函数**（v3 spec §3，画板 `ImageStates` / `ImageSelected` / `PromptBar`）。
 *
 * 卡宽 / 卡高 / 版本表 / 画面弹层的读数与估价，全在这里算完再交给组件 ——
 * ⛔ 组件里不再出现第二份算术（v3 的卡宽在三处各算了一遍，改一处另两处不跟）。
 */

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { IMAGE_SIZES, type AspectRatio } from '@/constants/config'
import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
} from '@/constants/provider-capabilities'
import { IMAGE_BATCH_COUNTS } from '@/constants/studio'
import { NODE_SLOT_IDS, getNodeV4Ports } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS, type NodeV4Subtype } from '@/constants/node-types'
import {
  NODE_V4_CARD,
  NODE_V4_IMAGE_QUALITY_COST,
  resolveReferenceAssetLimit,
} from '@/constants/node-studio'
import { readOutputVersions } from '@/lib/node-output-versions'
import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
} from '@/constants/models/unit-prices'
import type {
  NodeV4ImageData,
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

/** 画面弹层里的比例档 —— 直接取 `IMAGE_SIZES` 的键，⛔ 不另列一份。 */
export const IMAGE_ASPECT_RATIO_OPTIONS = Object.keys(
  IMAGE_SIZES,
) as readonly AspectRatio[]

/**
 * 收起态卡宽：按媒体比例算，钳在两个已有档位之间（⛔ 不新造魔法值）。
 *
 * ⚠ 与 §3「卡即图，按真实比例」配套的是**高**由 `collapsedImageHeight` 给：
 * 只钳宽会让竖图在一个 16:9 的框里两侧留白，那正是 v3 的老样子。
 */
export function collapsedImageWidth(data: NodeV4ImageData): number {
  const { mediaWidth, mediaHeight } = data
  if (!mediaWidth || !mediaHeight) return NODE_V4_CARD.collapsedWidth
  const ratio = mediaWidth / mediaHeight
  const width = NODE_V4_CARD.collapsedWidth * Math.min(Math.max(ratio, 1), 1.5)
  return Math.round(
    Math.min(
      Math.max(width, NODE_V4_CARD.collapsedWidth),
      NODE_V4_CARD.expandedWidth,
    ),
  )
}

/**
 * 卡高 = 宽 ÷ 真实比例。缺尺寸时退回空卡那一档（16:9），⛔ 不返回 0：
 * 高度 0 的卡在画布上会塌成一条线，用户读成「这张卡坏了」。
 */
export function collapsedImageHeight(data: NodeV4ImageData): number {
  const width = collapsedImageWidth(data)
  const { mediaWidth, mediaHeight } = data
  if (!mediaWidth || !mediaHeight) return Math.round((width * 9) / 16)
  return Math.round(width * (mediaHeight / mediaWidth))
}

/** 字节数 → 人读得懂的一行。⛔ 不引库，两档够用。 */
export function formatSizeBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 这张卡交付过的每一版的地址（spec §1.8）—— 版本点唯一的读侧。
 *
 * ⚠ S3b 起数据层有了产出版本表（`outputs.versions`），所以这里不再是「永远一
 * 条」。读的是 `readOutputVersions`，⛔ 组件里不再各自拼一份列表：存量卡（只有
 * 裸 `url`）在那一层就已经被当成一版了。少于两版时 `VersionDots` 自己不渲染。
 */
export function imageVersions(data: NodeV4ImageData): readonly string[] {
  return readOutputVersions(data).map((version) => version.url)
}

/**
 * 画面弹层里的**质量 / 分辨率 / 张数**三段（spec §3）。
 *
 * ⚠ 三段都返回 `{ value, disabled }` 而不是「过滤后的可选项」：Hard Rule 8 那条
 * 「不支持的档**禁用不隐藏**」—— 换一个模型时档位数目不变、只是灰掉几个，用户
 * 因此看得见「这个模型少了 4K」，而不是弹层莫名其妙变矮了一截。
 *
 * ⚠ 值域来自**能力表**（`getCapabilityConfig`），⛔ 不在这里另列一份：模型加一
 * 档质量时这里自动跟上。能力表没声明 = 这个模型这一整段不可用（返回空数组，
 * 渲染层整段不画 —— 那是组级不可用，与「某一档灰掉」是两件事）。
 */
export interface ImageSpecOption {
  readonly value: string
  readonly disabled: boolean
}

function optionsFrom(
  all: readonly string[],
  supported: readonly string[] | undefined,
): readonly ImageSpecOption[] {
  if (!supported || supported.length === 0) return []
  return all.map((value) => ({ value, disabled: !supported.includes(value) }))
}

/** 全仓出现过的质量档之并集 —— 灰掉哪几档由每个模型的能力表决定。 */
export const IMAGE_QUALITY_TIERS = Object.keys(
  NODE_V4_IMAGE_QUALITY_COST,
) as readonly string[]

/** 全仓出现过的分辨率档之并集。 */
export const IMAGE_RESOLUTION_TIERS = [
  'auto',
  '1K',
  '2K',
  '4K',
] as const satisfies readonly string[]

/**
 * 能力表查询。⚠ 先问 adapter 在不在表里：`getCapabilityConfig` 直接下标一个
 * `Record`，认不出来的 adapter 会返回 `undefined` 而它的签名说不会 —— 弹层因此
 * 整张卡白屏。⛔ 不给不认识的 adapter 编一份能力。
 */
function capabilityOf(
  model: Pick<NodeWorkflowModelOption, 'adapterType' | 'modelId'>,
) {
  if (!(model.adapterType in ADAPTER_CAPABILITIES)) return undefined
  return getCapabilityConfig(model.adapterType, model.modelId)
}

export function imageQualityOptions(
  model: Pick<NodeWorkflowModelOption, 'adapterType' | 'modelId'> | undefined,
): readonly ImageSpecOption[] {
  if (!model) return []
  return optionsFrom(IMAGE_QUALITY_TIERS, capabilityOf(model)?.qualityOptions)
}

export function imageResolutionOptions(
  model: Pick<NodeWorkflowModelOption, 'adapterType' | 'modelId'> | undefined,
): readonly ImageSpecOption[] {
  if (!model) return []
  return optionsFrom(
    IMAGE_RESOLUTION_TIERS,
    capabilityOf(model)?.resolutionOptions,
  )
}

/**
 * 张数档。⚠ 本仓 **1 请求 = 1 张**，所以档位直接是 `IMAGE_BATCH_COUNTS`，
 * ⛔ 不在这里抄一份 `[1,2,4]`。张数与模型无关 —— 一档都不灰。
 */
export const IMAGE_COUNT_OPTIONS: readonly ImageSpecOption[] =
  IMAGE_BATCH_COUNTS.map((count) => ({ value: String(count), disabled: false }))

/**
 * 这一次大概花多少：**单价 × 张数 × 质量系数**。
 *
 * ⚠ 系数是**估价**不是账单：真正扣多少由服务端按实际用量算（`generate` 那条 op
 * 仍是唯一扣 credit 的地方）。所以这里给的是一个让用户「点之前心里有数」的数，
 * ⛔ 不拿它去做任何闸。缺单价时返回 `null` —— ⛔ 不写「$0」。
 */
export function imageCostEstimate(
  modelId: string | undefined,
  params: { readonly quality?: string; readonly count?: number } = {},
): number | null {
  const price = modelId ? getModelUnitPriceByStringId(modelId) : null
  if (!price || price.unit !== 'image') return null
  const count = params.count ?? 1
  const multiplier =
    NODE_V4_IMAGE_QUALITY_COST[
      (params.quality ?? '') as keyof typeof NODE_V4_IMAGE_QUALITY_COST
    ] ?? 1
  return price.amount * count * multiplier
}

/**
 * 画面弹层底部那一行：`W×H · 约 $x/张`。
 *
 * ⚠ **只报真的会发出去的那个尺寸**：图片生成的载荷里只有 `aspectRatio`
 * （`planV4Generation` 的 image 分支），所以 W×H 读 `IMAGE_SIZES` 的原值。
 * ⛔ 不按「分辨率档」乘一个我们编的倍数 —— 那会在卡上写一个服务端根本收不到的
 * 尺寸。缺价时返回不带价的半行，⛔ 不写「¥0」。
 */
export function imageFrameReadout(
  aspectRatio: string | undefined,
  modelId: string | undefined,
  params: { readonly quality?: string; readonly count?: number } = {},
): string {
  const size = IMAGE_SIZES[(aspectRatio ?? '') as AspectRatio]
  const dimension = size ? `${size.width}×${size.height}` : null
  const estimate = imageCostEstimate(modelId, params)
  // ⚠ USD 的格式化沿用 `formatUnitPriceAmount`，⛔ 不在这里自己拼 `$`：
  // 单价那一层已经决定了小数位与币种。
  const priceText = estimate === null ? null : formatUnitPriceAmount(estimate)
  return [dimension, priceText].filter(Boolean).join(' · ')
}

/**
 * `NodeWorkflowModelOption` → `StudioModelOption`（`ModelPickerPopover` 认的形状）。
 *
 * ⚠ 与 `WorkflowModelPicker.toStudioOption` 同一份映射（`apiKeyId → keyId`、
 * `sourceType → isBuiltIn`）。⛔ 不在这里改口径：两处对不上时选中的模型会在两个
 * 入口之间漂。
 */
export function toStudioModelOption(
  option: NodeWorkflowModelOption,
): StudioModelOption {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    requestCount: option.requestCount,
    isBuiltIn: option.sourceType === 'workspace',
    sourceType: option.sourceType,
    ...(option.apiKeyId ? { keyId: option.apiKeyId } : {}),
    ...(option.keyLabel ? { keyLabel: option.keyLabel } : {}),
    ...(option.maskedKey ? { maskedKey: option.maskedKey } : {}),
    ...(option.providerKeyId ? { providerKeyId: option.providerKeyId } : {}),
  }
}

/** 这张图片卡的端口表里有没有 `reference` 入口（叶子参考图没有）。 */
export function imageNodeAcceptsReferences(subtype: string): boolean {
  const ports = getNodeV4Ports(
    NODE_MEDIA_KIND_IDS.image,
    subtype as NodeV4Subtype,
  )
  return Boolean(
    ports?.inputs.some((spec) => spec.slot === NODE_SLOT_IDS.reference),
  )
}

/** 当前模型的参考图上限；没选模型时用角色卡默认档，加号不灰。 */
export function imageRailCapacity(
  model: NodeWorkflowModelSelection | undefined,
): number {
  return resolveReferenceAssetLimit(
    model?.modelId && model.adapterType
      ? { adapterType: model.adapterType, modelId: model.modelId }
      : undefined,
  )
}
