import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeStudioServer, renderHookWithStudio } from '@/test/studio-harness'
import { useStudioReplayFromUrl } from './use-studio-replay-from-url'

const nav = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

function renderReplay() {
  return renderHookWithStudio(() => useStudioReplayFromUrl())
}

beforeEach(() => {
  fakeStudioServer()
  nav.query = ''
  window.history.replaceState({}, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Studio recovery link', () => {
  it('restores ordered references before the prompt and consumes replay parameters', () => {
    const params = new URLSearchParams({
      prompt: 'Use @Image1 then @Image2',
      style: 'keep-this',
    })
    params.append('referenceImage', 'https://example.com/one.png')
    params.append('referenceImage', 'https://example.com/two.png')
    nav.query = params.toString()
    window.history.replaceState({}, '', `/?${nav.query}`)
    const view = renderReplay()
    const { studio } = view.result.current
    expect(studio.imageUpload.referenceImages).toEqual([
      'https://example.com/one.png',
      'https://example.com/two.png',
    ])
    // 先清参考图再填提示词：顺序反了，清图会把 @Image 提及从提示词里删掉。
    expect(studio.state.prompt).toBe('Use @Image1 then @Image2')
    expect(window.location.search).toBe('?style=keep-this')

    act(() => {
      studio.imageUpload.removeReferenceImage(1)
    })
    view.rerender()
    // 只回放一次：之后用户改动不会被地址栏的参数再盖回来。
    expect(view.result.current.studio.imageUpload.referenceImages).toEqual([
      'https://example.com/one.png',
    ])
  })

  it('ignores nonpersistent or invalid reference URLs', () => {
    nav.query =
      'referenceImage=javascript%3Aalert(1)&referenceImage=blob%3Atest&referenceImage=not-a-url'
    const { result } = renderReplay()
    expect(result.current.studio.imageUpload.referenceImages).toEqual([])
  })

  it('generate=1 填完提示词后下一拍才请求出图，并从地址栏拿掉', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    nav.query = 'prompt=%E6%B5%B7%E8%BE%B9&generate=1'
    window.history.replaceState({}, '', `/?${nav.query}`)
    const { result } = renderReplay()
    expect(result.current.studio.state.prompt).toBe('海边')
    expect(result.current.studio.state.generateRequestId).toBe(0)
    act(() => {
      vi.runAllTimers()
    })
    expect(result.current.studio.state.generateRequestId).toBe(1)
    expect(window.location.search).toBe('')
  })

  it('没有 generate=1 只填不出图', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    nav.query = 'prompt=hello'
    const { result } = renderReplay()
    act(() => {
      vi.runAllTimers()
    })
    expect(result.current.studio.state.prompt).toBe('hello')
    expect(result.current.studio.state.generateRequestId).toBe(0)
  })
})
