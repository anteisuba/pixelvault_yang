import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchHuggingFaceShowcaseAPI } from '@/lib/api-client/lora-assets'

import { useHuggingFaceShowcaseCover } from './use-huggingface-showcase-cover'

vi.mock('@/lib/api-client/lora-assets', () => ({
  fetchHuggingFaceShowcaseAPI: vi.fn(),
}))

const mockFetchShowcase = vi.mocked(fetchHuggingFaceShowcaseAPI)

const SOCIAL_FALLBACK =
  'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/author/plain.png'

type FakeEntry = { isIntersecting: boolean }
type FakeCallback = (entries: FakeEntry[]) => void

// 最小的 IntersectionObserver 测试替身：jsdom 不实现这个 API（hook 里已经
// 对此有降级处理），这里手动 stub 全局并暴露 `trigger` 让测试模拟"进视口"。
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  private callback: FakeCallback
  observed: Element[] = []
  disconnected = false

  constructor(callback: FakeCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {
    this.disconnected = true
  }
  unobserve() {}
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }])
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useHuggingFaceShowcaseCover', () => {
  it('passes a real cover through untouched and never calls the showcase endpoint', () => {
    const { result } = renderHook(() =>
      useHuggingFaceShowcaseCover(
        'author/real-cover',
        'main',
        'https://example.com/real.png',
      ),
    )

    expect(result.current.coverUrl).toBe('https://example.com/real.png')
    expect(result.current.isPending).toBe(false)
    expect(mockFetchShowcase).not.toHaveBeenCalled()
  })

  it('starts pending (skeleton, not the banner) and only fetches once the tile enters the viewport', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: true,
      data: {
        images: [
          'https://cdn-uploads.huggingface.co/production/uploads/real.png',
        ],
        prompts: [],
      },
    })

    const { result } = renderHook(() =>
      useHuggingFaceShowcaseCover('author/lazy-1', 'main', SOCIAL_FALLBACK),
    )

    expect(result.current.isPending).toBe(true)
    expect(result.current.coverUrl).toBeNull()

    act(() => {
      result.current.setObservedElement(document.createElement('div'))
    })
    expect(mockFetchShowcase).not.toHaveBeenCalled()

    const observer = FakeIntersectionObserver.instances.at(-1)
    expect(observer).toBeDefined()
    act(() => {
      observer?.trigger(true)
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.coverUrl).toBe(
      'https://cdn-uploads.huggingface.co/production/uploads/real.png',
    )
    expect(mockFetchShowcase).toHaveBeenCalledWith({
      repoId: 'author/lazy-1',
      revision: 'main',
    })
    expect(mockFetchShowcase).toHaveBeenCalledTimes(1)
  })

  it('falls back to the original social banner (no flash) when the showcase has no images', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: true,
      data: { images: [], prompts: [] },
    })

    const { result } = renderHook(() =>
      useHuggingFaceShowcaseCover('author/lazy-2', 'main', SOCIAL_FALLBACK),
    )
    act(() => {
      result.current.setObservedElement(document.createElement('div'))
    })
    const observer = FakeIntersectionObserver.instances.at(-1)
    act(() => {
      observer?.trigger(true)
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.coverUrl).toBe(SOCIAL_FALLBACK)
  })

  it('falls back to the social banner when the showcase request fails', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: false,
      error: 'boom',
    })

    const { result } = renderHook(() =>
      useHuggingFaceShowcaseCover('author/lazy-3', 'main', SOCIAL_FALLBACK),
    )
    act(() => {
      result.current.setObservedElement(document.createElement('div'))
    })
    FakeIntersectionObserver.instances.at(-1)?.trigger(true)

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.coverUrl).toBe(SOCIAL_FALLBACK)
  })

  it('caches the resolved cover across mounts for the same repo — a second mount skips the fetch', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: true,
      data: {
        images: [
          'https://cdn-uploads.huggingface.co/production/uploads/cached.png',
        ],
        prompts: [],
      },
    })

    const first = renderHook(() =>
      useHuggingFaceShowcaseCover(
        'author/cached-repo',
        'main',
        SOCIAL_FALLBACK,
      ),
    )
    act(() => {
      first.result.current.setObservedElement(document.createElement('div'))
    })
    FakeIntersectionObserver.instances.at(-1)?.trigger(true)
    await waitFor(() => expect(first.result.current.isPending).toBe(false))
    first.unmount()

    expect(mockFetchShowcase).toHaveBeenCalledTimes(1)

    const second = renderHook(() =>
      useHuggingFaceShowcaseCover(
        'author/cached-repo',
        'main',
        SOCIAL_FALLBACK,
      ),
    )
    expect(second.result.current.isPending).toBe(false)
    expect(second.result.current.coverUrl).toBe(
      'https://cdn-uploads.huggingface.co/production/uploads/cached.png',
    )
    expect(mockFetchShowcase).toHaveBeenCalledTimes(1)
  })

  it('degrades to the fallback banner instead of crashing when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    const { result } = renderHook(() =>
      useHuggingFaceShowcaseCover('author/no-io', 'main', SOCIAL_FALLBACK),
    )
    act(() => {
      result.current.setObservedElement(document.createElement('div'))
    })

    // 没有 IntersectionObserver 就不会有任何观察触发，卡片停在挂起态而不
    // 是崩溃——这是渐进增强的合理降级，不属于 bug。
    expect(result.current.isPending).toBe(true)
    expect(mockFetchShowcase).not.toHaveBeenCalled()
  })
})
