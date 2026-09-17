/**
 * 「这张新卡该带哪个模型」——**与选择器同一条规则**（手选 › 自己的 key › 最便宜，
 * `resolveModelChannel`）。
 *
 * ⚠ `resolveModelChannel` 本来回答的是「一个型号底下走哪条渠道」；默认模型问的是
 * 「整份清单里挑哪一条」。两问的**判据完全一样**（档 → 健康 → 价 → 清单顺序），
 * 所以这里把整份清单当成一组候选交给它，⛔ 不另写一份排序 —— 另写一份就会出现
 * 「chip 上默认选了 A，点开选择器里 A 那一行却说该走 B」。
 */

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { getProviderLabel } from '@/constants/providers'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import {
  resolveModelChannel,
  type ModelChannelCandidate,
} from '@/lib/resolve-model-channel'
import type { ApiKeyHealthStatus } from '@/types'

export type ModelHealthMap = Readonly<Record<string, ApiKeyHealthStatus>>

/** 一条清单条目 → 选择规则认的候选。选择器与默认模型共用这一份映射。 */
export function toModelChannelCandidate(
  option: StudioModelOption,
  healthMap: ModelHealthMap = {},
  channelLabel?: string,
): ModelChannelCandidate {
  const keyId = option.keyId ?? option.providerKeyId
  const unitPrice = getModelUnitPriceByStringId(option.modelId)
  return {
    channelId: option.optionId,
    channelLabel: channelLabel ?? getProviderLabel(option.providerConfig),
    hasUserKey: option.sourceType === 'saved' || Boolean(option.providerKeyId),
    unitPrice: unitPrice?.amount ?? null,
    ...(keyId && healthMap[keyId] ? { health: healthMap[keyId] } : {}),
  }
}

/**
 * 这份清单里的默认那条。⚠ 只在**今天能跑**的条目里挑（缺 key 的型号选择器里灰显
 * 可点，但拿它当默认等于给新卡配一个一按就要去配 key 的模型）。都不能跑时退回
 * 清单第一条 —— 卡上仍然有一颗写着型号名的 chip，点开就是配置入口（Hard Rule 8）。
 */
export function pickDefaultModelOption(
  options: readonly StudioModelOption[],
  healthMap: ModelHealthMap = {},
): StudioModelOption | null {
  if (options.length === 0) return null
  const runnable = options.filter(isRunnableModelOption)
  const pool = runnable.length > 0 ? runnable : options
  const resolved = resolveModelChannel(
    pool.map((option) => toModelChannelCandidate(option, healthMap)),
  )
  if (!resolved) return null
  return (
    pool.find((option) => option.optionId === resolved.channel.channelId) ??
    null
  )
}
