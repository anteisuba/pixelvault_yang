/**
 * 「这张新卡该带哪个模型」。
 *
 * ⚠ 2026-09-17 owner 在 D2 Q1 删掉了「自动选渠道」（见 `resolveModelChannel`），
 * 这里也跟着退成一条规则：**清单里第一条今天能跑的**。那份清单在
 * `use*ModelOptions` 里已经按偏好排过（自己配的 key 排前面），所以「第一条能跑
 * 的」就是用户自己安排的顺序里最靠前的那条 —— ⛔ 不再按价格二次排序，那是被删掉
 * 的「最便宜」规则的最后一处残留。
 */

import type { StudioModelOption } from '@/types/model-option'
import { getProviderLabel } from '@/constants/providers'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import type { ModelChannelCandidate } from '@/lib/resolve-model-channel'
import type { ApiKeyHealthStatus } from '@/types'

export type ModelHealthMap = Readonly<Record<string, ApiKeyHealthStatus>>

/** 一条清单条目 → 选择器认的渠道候选。选择器与新卡默认模型共用这一份映射。 */
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
 * 这份清单里的默认那条。⚠ 只在**今天能跑**的条目里挑（缺 key 的型号选择器里仍然
 * 可点，但拿它当默认等于给新卡配一个一按就要去配 key 的模型）。都不能跑时退回
 * 清单第一条 —— 卡上仍然有一颗写着型号名的 chip，点开就是配置入口（Hard Rule 8）。
 */
export function pickDefaultModelOption(
  options: readonly StudioModelOption[],
): StudioModelOption | null {
  if (options.length === 0) return null
  return options.find(isRunnableModelOption) ?? options[0] ?? null
}
