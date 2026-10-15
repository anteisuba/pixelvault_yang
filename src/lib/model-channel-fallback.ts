/**
 * 一个型号底下几条渠道（fal / 火山 / BytePlus …）之间「该走哪条」的两个纯函数。
 *
 * - `pickPreferredRunnableChannel`：能跑的里面挑一条 —— 自己配的 key 优先，再挑
 *   便宜的。画布选择器点行时的默认（`ModelPickerPopover` 的 canvas 档）用它。
 * - `findRunnableSiblingChannel`：卡上落着的那条渠道没 key 了，同型号还有别的
 *   渠道能跑 —— 发送键旁边写「fal 没 key，改走 火山」（owner 2026-10-15：点一下
 *   才切，⛔ 不偷偷换厂商）。
 */

import type { StudioModelOption } from '@/types/model-option'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import {
  channelHasOption,
  groupModelsForPicker,
  type PickerChannel,
} from '@/lib/group-models-for-picker'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'

function hasOwnKey(option: StudioModelOption): boolean {
  return option.sourceType === 'saved' || Boolean(option.providerKeyId)
}

/** 单价最低的那条（查不到价的排后面，同价取先出现的）。 */
export function pickCheapestChannel<
  T extends { readonly option: StudioModelOption },
>(channels: readonly T[]): T | null {
  if (channels.length === 0) return null
  return channels.reduce((best, channel) => {
    const candidatePrice = getModelUnitPriceByStringId(channel.option.modelId)
    const bestPrice = getModelUnitPriceByStringId(best.option.modelId)
    if (!candidatePrice) return best
    if (!bestPrice) return channel
    return candidatePrice.unit === bestPrice.unit &&
      candidatePrice.amount < bestPrice.amount
      ? channel
      : best
  })
}

/** 能跑的渠道里挑一条：自己的 key 优先，同档挑单价低的；一条都跑不了返回 null。 */
export function pickPreferredRunnableChannel<
  T extends { readonly option: StudioModelOption },
>(channels: readonly T[]): T | null {
  const runnable = channels.filter((channel) =>
    isRunnableModelOption(channel.option),
  )
  const ownKey = runnable.filter((channel) => hasOwnKey(channel.option))
  return pickCheapestChannel(ownKey.length > 0 ? ownKey : runnable)
}

/** 一条渠道连同它所在型号的全部渠道。 */
export interface ModelChannelSiblings {
  readonly current: PickerChannel
  readonly channels: readonly PickerChannel[]
}

/**
 * `optionId` 所在的那条渠道，以及同型号的全部渠道（含它自己）。认不出来返回 null。
 *
 * ⚠ 分组与选择器同一份（`groupModelsForPicker`），⛔ 不按 modelId 前缀自己猜同族
 * —— 两边对不上时，选择器里一个型号的两条渠道在这里会被当成两个型号。
 */
export function findModelChannelSiblings(
  options: readonly StudioModelOption[],
  optionId: string,
): ModelChannelSiblings | null {
  for (const series of groupModelsForPicker(options, (o) => o.modelId)) {
    for (const model of series.models) {
      const current = model.channels.find((channel) =>
        channelHasOption(channel, optionId),
      )
      if (current) return { current, channels: model.channels }
    }
  }
  return null
}

export interface RunnableSiblingChannel {
  /** 卡上落着、但跑不起来的那条。 */
  readonly current: PickerChannel
  /** 同型号能跑的那条（挑法同 `pickPreferredRunnableChannel`）。 */
  readonly fallback: PickerChannel
}

/**
 * 卡上那条渠道跑不起来、而同型号另一条能跑时，给出那一条；否则 null。
 *
 * ⚠ 只在**确定缺 key**时调（`isMissingKeyModelOption`）：key 名单没回来之前
 * 每条都「跑不起来」，那时提示改走别家是误报。
 */
export function findRunnableSiblingChannel(
  options: readonly StudioModelOption[],
  optionId: string,
): RunnableSiblingChannel | null {
  const siblings = findModelChannelSiblings(options, optionId)
  if (!siblings) return null
  if (isRunnableModelOption(siblings.current.option)) return null
  const fallback = pickPreferredRunnableChannel(
    siblings.channels.filter(
      (channel) => channel.channelId !== siblings.current.channelId,
    ),
  )
  return fallback ? { current: siblings.current, fallback } : null
}
