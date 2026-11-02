'use client'

import { useMemo } from 'react'

import { ACTIVE_API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import { getAvailableModels } from '@/constants/models'
import {
  ADAPTER_CUSTOM_MODEL_EXAMPLES,
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

/**
 * key 行的三态（D3 ④ key 行画板）：绿 = 可用 · 红 = 失效（401 / 403）·
 * 灰 = 未配置。⚠ 「黄 = 缺 key」只在模型选择器的渠道面板里出现，设置页没有
 * 「缺」只有「未配置」。
 */
export type ProviderKeyState =
  | 'invalid'
  | 'healthy'
  | 'unverified'
  | 'unconfigured'

export interface ProviderKeyRow {
  adapterType: AI_ADAPTER_TYPES
  label: string
  /** 这把 key 解锁几个内置模型。 */
  modelCount: number
  /**
   * 这家下面任意一个内置模型 id —— 面 1 拿它命名并在验完后自动选中。
   * 纯文本渠道（DeepSeek / Anthropic / xAI）在模型目录里没有条目，退到
   * `ADAPTER_CUSTOM_MODEL_EXAMPLES`，⛔ 不给它一个空串（schema 会拒）。
   */
  sampleModelId: string
  state: ProviderKeyState
  /** 这家已启用的 key（停用的不算「配过」）。 */
  keys: UserApiKeyRecord[]
}

export interface ProviderKeyRowsResult {
  rows: ProviderKeyRow[]
  /** 失效的 key **把数**（手机一级列表那句摘要用的就是它）。 */
  invalidKeyCount: number
  healthMap: Record<string, ApiKeyHealthStatus>
  verifiedAtMap: Record<string, number>
  isLoading: boolean
}

/** 排序：失效 → 已配 → 未配置；同一档内按名字。 */
const STATE_ORDER: Record<ProviderKeyState, number> = {
  invalid: 0,
  healthy: 1,
  unverified: 1,
  unconfigured: 2,
}

function resolveState(
  activeKeys: UserApiKeyRecord[],
  healthMap: Record<string, ApiKeyHealthStatus>,
): ProviderKeyState {
  if (activeKeys.length === 0) return 'unconfigured'
  const statuses = activeKeys.map((key) => healthMap[key.id] ?? 'unknown')
  if (statuses.some((status) => status === 'available')) return 'healthy'
  if (statuses.some((status) => status === 'failed')) return 'invalid'
  return 'unverified'
}

/**
 * `/settings/keys` 与手机一级列表共用的那一份**按 provider 一行**的数据。
 * 名单 = 能解锁内置模型或 LLM 能力的 adapter（`ACTIVE_API_KEY_ADAPTER_OPTIONS`），
 * ⛔ 不含 runner —— 它压根没有 BYOK 通道。
 */
export function useProviderKeyRows(): ProviderKeyRowsResult {
  const { keys, healthMap, verifiedAtMap, isLoading } = useApiKeysContext()

  const rows = useMemo(() => {
    const models = getAvailableModels()
    const coverage = new Map<AI_ADAPTER_TYPES, number>()
    const sampleModel = new Map<AI_ADAPTER_TYPES, string>()
    for (const model of models) {
      coverage.set(
        model.adapterType,
        (coverage.get(model.adapterType) ?? 0) + 1,
      )
      if (!sampleModel.has(model.adapterType)) {
        sampleModel.set(model.adapterType, model.id)
      }
    }

    return ACTIVE_API_KEY_ADAPTER_OPTIONS.map((adapterType) => {
      const activeKeys = keys.filter(
        (key) => key.adapterType === adapterType && key.isActive,
      )
      return {
        adapterType,
        label: getProviderLabel(
          activeKeys[0]?.providerConfig ??
            getDefaultProviderConfig(adapterType),
        ),
        modelCount: coverage.get(adapterType) ?? 0,
        sampleModelId:
          sampleModel.get(adapterType) ??
          ADAPTER_CUSTOM_MODEL_EXAMPLES[adapterType],
        state: resolveState(activeKeys, healthMap),
        keys: activeKeys,
      } satisfies ProviderKeyRow
    }).sort(
      (left, right) =>
        STATE_ORDER[left.state] - STATE_ORDER[right.state] ||
        left.label.localeCompare(right.label),
    )
  }, [keys, healthMap])

  const invalidKeyCount = useMemo(
    () =>
      keys.filter((key) => key.isActive && healthMap[key.id] === 'failed')
        .length,
    [keys, healthMap],
  )

  return { rows, invalidKeyCount, healthMap, verifiedAtMap, isLoading }
}
