import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'

/**
 * 选择器认的一条「模型 × 路由」。
 *
 * ⚠ 一条 `StudioModelOption` **不是一个型号**，是**型号上的一条具体的路**（某个
 * adapter + 某把 key）。统一模型选择器（D2 ④）把同一型号的多条折成一行、把渠道摆
 * 进右侧面板，靠的就是这份形状里的 `adapterType` 与 `keyId ?? providerKeyId`。
 *
 * ⚠ 2026-09-17 这份类型从 `components/business/ModelSelector.tsx` 搬来：那个组件是
 * 收口前那批选择器里已经没有调用方的一个，随统一选择器整删，类型不该跟着一个 UI
 * 文件走。
 */
export interface StudioModelOption {
  optionId: string
  modelId: string
  displayLabel?: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  requestCount: number
  isBuiltIn: boolean
  sourceType: 'workspace' | 'saved'
  keyId?: string
  keyLabel?: string
  maskedKey?: string
  /**
   * Set on workspace options whose provider already has an active key, which
   * makes them runnable today even though no key row is bound to this exact
   * model id. See `withProviderKeyCoverage` in `@/lib/model-options`.
   */
  providerKeyId?: string
}
