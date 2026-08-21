import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStudioAssistantReference } from '@/hooks/use-studio-assistant-reference'

// ⚠ store 是模块级的，用例之间会串。每条用例开头先清空。
beforeEach(() => {
  const { result } = renderHook(() => useStudioAssistantReference())
  act(() => result.current.clearReference())
})

describe('useStudioAssistantReference', () => {
  it('hands the same injected reference to every subscriber', () => {
    const host = renderHook(() => useStudioAssistantReference())
    const panel = renderHook(() => useStudioAssistantReference())

    act(() => host.result.current.injectReference('https://cdn.test/a.png'))

    // 发起方（结果图上的按钮）与消费方（面板宿主）是 DOM 树上的兄弟分支，
    // 中间没有 props —— 这条就是「注入真的过得去」的判据。
    expect(panel.result.current.injectedReference?.url).toBe(
      'https://cdn.test/a.png',
    )
  })

  it('bumps the token on every injection so the same image can be re-attached', () => {
    const { result } = renderHook(() => useStudioAssistantReference())

    act(() => result.current.injectReference('https://cdn.test/a.png'))
    const first = result.current.injectedReference?.token ?? 0

    // 移除后再点同一张：仅按 url 去重会让第二次静默无效，所以令牌必须往前走。
    act(() => result.current.injectReference('https://cdn.test/a.png'))
    expect(result.current.injectedReference?.token).toBe(first + 1)
  })

  it('drops the pending reference when cleared', () => {
    const { result } = renderHook(() => useStudioAssistantReference())

    act(() => result.current.injectReference('https://cdn.test/a.png'))
    act(() => result.current.clearReference())

    // 面板关掉后必须归零：移动端抽屉重开会重新挂载面板，留着旧引用等于
    // 用户没点却又挂上一张图。
    expect(result.current.injectedReference).toBeUndefined()
  })

  // ⚠ 清空**不能**让令牌回退。桌面 dock 的面板从不卸载，它记着上一次的
  // `lastInjectedToken`；令牌回到 1 会让「关掉助手 → 再点另一张图」被判成
  // 同一次注入而静默失效 —— 而且只在关过一次之后才复现，最难查的那种。
  it('never rewinds the token after a clear', () => {
    const { result } = renderHook(() => useStudioAssistantReference())

    act(() => result.current.injectReference('https://cdn.test/a.png'))
    const before = result.current.injectedReference?.token ?? 0

    act(() => result.current.clearReference())
    act(() => result.current.injectReference('https://cdn.test/b.png'))

    expect(result.current.injectedReference?.token).toBeGreaterThan(before)
  })
})
