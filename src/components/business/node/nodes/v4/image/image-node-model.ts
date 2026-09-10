/**
 * 图片节点的**纯读函数**（v3 spec §3，画板 `ImageStates` / `ImageSelected` / `PromptBar`）。
 *
 * 卡宽 / 卡高 / 版本表 / 画面弹层的读数与估价，全在这里算完再交给组件 ——
 * ⛔ 组件里不再出现第二份算术（v3 的卡宽在三处各算了一遍，改一处另两处不跟）。
 */

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { IMAGE_SIZES, type AspectRatio } from '@/constants/config'
import { NODE_V4_CARD } from '@/constants/node-studio'
import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
} from '@/constants/models/unit-prices'
import type {
  NodeV4ImageData,
  NodeWorkflowModelOption,
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
 * 这张卡当前有几版、看的是第几版（spec §1.8）。
 *
 * ⚠ **今天只有一版**：v4 的图片节点身上只有一个 `url`，「一张卡 N 个产出版本」
 * 在数据层还没有落点（`slots[].versions` 是**入口槽**的版本，不是产出）。所以
 * 这个函数是版本点唯一的读侧：数据层补上产出版本表之后只改这里，⛔ 组件里不再
 * 各自拼一份列表。少于两版时 `VersionDots` 自己不渲染。
 */
export function imageVersions(data: NodeV4ImageData): readonly string[] {
  return data.url ? [data.url] : []
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
): string {
  const size = IMAGE_SIZES[(aspectRatio ?? '') as AspectRatio]
  const dimension = size ? `${size.width}×${size.height}` : null
  const price = modelId ? getModelUnitPriceByStringId(modelId) : null
  const priceText =
    price && price.unit === 'image' ? formatUnitPriceAmount(price.amount) : null
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
    ...(option.freeTier === undefined ? {} : { freeTier: option.freeTier }),
    ...(option.apiKeyId ? { keyId: option.apiKeyId } : {}),
    ...(option.keyLabel ? { keyLabel: option.keyLabel } : {}),
    ...(option.maskedKey ? { maskedKey: option.maskedKey } : {}),
    ...(option.providerKeyId ? { providerKeyId: option.providerKeyId } : {}),
  }
}
