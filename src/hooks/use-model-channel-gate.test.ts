import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import {
  modelPickerGateKey,
  resetModelPickerGate,
  setPendingModel,
  subscribeModelPickerOpen,
} from '@/lib/model-picker-gate'

beforeEach(() => {
  window.localStorage.clear()
  resetModelPickerGate()
})

/**
 * D2 Q1 的代价那一条：没有「自动」渠道，所以「选了型号没选渠道」是一个会挡住生成
 * 的真状态。这一组锁住闸门本身的语义。
 */
describe('useModelChannelGate', () => {
  it('默认不挡 —— 没有型号在等渠道', () => {
    const { result } = renderHook(() => useModelChannelGate('image'))
    expect(result.current.blocked).toBe(false)
    expect(result.current.pendingModelKey).toBeNull()
  })

  it('选择器写下待选型号后立刻挡住（跨组件树，走模块级 store）', () => {
    const { result } = renderHook(() => useModelChannelGate('image'))
    act(() => {
      setPendingModel(modelPickerGateKey('image'), 'seedance-2.5')
    })
    expect(result.current.blocked).toBe(true)
    expect(result.current.pendingModelKey).toBe('seedance-2.5')
  })

  it('选定渠道后解除', () => {
    const { result } = renderHook(() => useModelChannelGate('image'))
    act(() => setPendingModel(modelPickerGateKey('image'), 'seedance-2.5'))
    act(() => setPendingModel(modelPickerGateKey('image'), null))
    expect(result.current.blocked).toBe(false)
  })

  /**
   * ⚠ 画布上几十张卡都是 `image`。按 scope 共用一份会让一张卡没选渠道挡住整块画布
   * —— 这正是 `gateId` 存在的理由。
   */
  it('gateId 把同一 scope 下的多个宿主隔开', () => {
    const cardA = renderHook(() => useModelChannelGate('image', 'node-a'))
    const cardB = renderHook(() => useModelChannelGate('image', 'node-b'))
    act(() => {
      setPendingModel(modelPickerGateKey('image', 'node-a'), 'seedance-2.5')
    })
    expect(cardA.result.current.blocked).toBe(true)
    expect(cardB.result.current.blocked).toBe(false)
  })

  it('不传 gateId 的宿主共用 scope 那一份', () => {
    const rail = renderHook(() => useModelChannelGate('audio'))
    act(() => setPendingModel(modelPickerGateKey('audio'), 'fish-s2-pro'))
    expect(rail.result.current.blocked).toBe(true)
  })

  it('requestPick 只叫醒同一对 (scope, gateId) 的那个选择器', () => {
    const mine = vi.fn()
    const other = vi.fn()
    subscribeModelPickerOpen(modelPickerGateKey('image', 'node-a'), mine)
    subscribeModelPickerOpen(modelPickerGateKey('image', 'node-b'), other)
    const { result } = renderHook(() => useModelChannelGate('image', 'node-a'))
    act(() => result.current.requestPick())
    expect(mine).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('待选型号跨会话记得住（落 localStorage）', () => {
    setPendingModel(modelPickerGateKey('video'), 'kling-o3-pro')
    const raw = window.localStorage.getItem('pv:model-picker:pending')
    expect(raw).toContain('kling-o3-pro')
    // 新一轮进程：store 重建后仍然从存储里读回来。
    resetModelPickerGate()
    const { result } = renderHook(() => useModelChannelGate('video'))
    expect(result.current.pendingModelKey).toBe('kling-o3-pro')
  })
})
