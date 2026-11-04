// @vitest-environment jsdom
/**
 * L2b：真 `StudioProvider`（真表单 reducer）+ 真线程 store；只假网络（`studioServer()`）。
 * 断言的是 store 里挂上的 chip 与表单里打开的面板。
 */
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { StudioProvider, useStudioForm } from '@/contexts/studio-context'
import { useAskAssistantAboutImage } from '@/features/assistant/hooks/use-ask-assistant-about-image'
import * as store from '@/hooks/use-studio-operator-store'
import { renderHookWithApp } from '@/test/app-harness'
import { studioServer } from '@/test/studio-harness'
import type { GenerationRecord } from '@/types'

const generation = {
  id: 'gen-1',
  url: 'https://cdn.example.com/gen-1.png',
  outputType: 'IMAGE',
  seq: 12,
} as unknown as GenerationRecord

function renderAsk() {
  return renderHookWithApp(
    () => ({ form: useStudioForm(), ask: useAskAssistantAboutImage() }),
    { inner: StudioProvider },
  )
}

describe('useAskAssistantAboutImage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    studioServer()
    store.clearOperatorMentions()
  })

  it('⭐ 把这张图挂成新助手输入框里的 chip，再打开面板（⛔ 不再注入旧面板的 store）', () => {
    const { result } = renderAsk()
    act(() =>
      result.current.form.dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' }),
    )
    expect(result.current.form.state.panels.enhance).toBe(false)

    act(() => result.current.ask(generation))

    expect(store.getOperatorState().mentions).toEqual([
      expect.objectContaining({
        id: 'gen-1',
        url: 'https://cdn.example.com/gen-1.png',
        kind: 'image',
        seq: 12,
      }),
    ])
    expect(result.current.form.state.panels.enhance).toBe(true)
  })

  it('同一张点两次只挂一枚', () => {
    const { result } = renderAsk()
    act(() => {
      result.current.ask(generation)
      result.current.ask(generation)
    })
    expect(store.getOperatorState().mentions).toHaveLength(1)
  })

  it('没有地址的图什么都不做', () => {
    const { result } = renderAsk()
    act(() => result.current.ask({ ...generation, url: '' }))
    expect(store.getOperatorState().mentions).toEqual([])
  })
})
