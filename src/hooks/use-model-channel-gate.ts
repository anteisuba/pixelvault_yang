'use client'

import { useCallback, useSyncExternalStore } from 'react'

import {
  getPendingModel,
  modelPickerGateKey,
  requestModelPickerOpen,
  subscribePendingModels,
} from '@/lib/model-picker-gate'

/**
 * 「这一档的模型还差一条渠道，所以这一枪打不出去」。
 *
 * D2 Q1（owner 2026-09-17）把「自动渠道」整条删掉之后的代价那一条：**多渠道型号
 * 没选渠道就不能生成**，生成按钮写「先选渠道」，点它打开该宿主的选择器并定位到那
 * 一行。五处宿主共用这一个 hook —— ⛔ 别在各自的生成路径里再判一遍「有没有渠道」，
 * 判据一分叉就会出现「按钮说能生成、选择器里那一行还空着」。
 *
 * `gateId`：同一 scope 下挂着多个选择器时（画布上每张卡都是 `image`）传各自的 id，
 * 让每张卡只被自己那一行挡住。单选择器的宿主不传。
 */
export interface ModelChannelGate {
  /** 挡住了 —— 有个型号在等渠道。 */
  readonly blocked: boolean
  /** 在等渠道的那个型号键；没有就是 null。 */
  readonly pendingModelKey: string | null
  /** 打开这一档的选择器并定位到那一行。 */
  readonly requestPick: () => void
}

export function useModelChannelGate(
  scope: string,
  gateId?: string,
): ModelChannelGate {
  const key = modelPickerGateKey(scope, gateId)
  const pendingModelKey = useSyncExternalStore(
    subscribePendingModels,
    () => getPendingModel(key),
    // 服务端没有 localStorage —— 首帧一律当没挡住，水合后再由订阅补上。
    () => null,
  )
  const requestPick = useCallback(() => requestModelPickerOpen(key), [key])
  return { blocked: pendingModelKey !== null, pendingModelKey, requestPick }
}
