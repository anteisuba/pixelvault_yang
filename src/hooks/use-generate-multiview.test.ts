import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { MultiViewGenerateRequest, MultiViewImageRecord } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/api-client', () => ({
  generateMultiViewAPI: vi.fn(),
}))

let mockAuthState: { isLoaded: boolean; userId: string | null } = {
  isLoaded: true,
  userId: 'user_test_clerk_1',
}
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuthState,
}))

import { generateMultiViewAPI } from '@/lib/api-client'
import { useGenerateMultiView } from './use-generate-multiview'

const mockGenerate = vi.mocked(generateMultiViewAPI)

const TEST_CLERK_ID = 'user_test_clerk_1'
const OTHER_CLERK_ID = 'user_test_clerk_2'

const SAMPLE_REQUEST: MultiViewGenerateRequest = {
  imageUrl: 'https://cdn.example.com/source.png',
  modelId: 'flux-edit',
}

function makeView(view: 'back' | 'left' | 'right'): MultiViewImageRecord {
  return {
    id: `view-${view}`,
    view,
    url: `https://cdn.example.com/${view}.png`,
    width: 512,
    height: 512,
    prompt: 'test prompt',
    model: 'flux-edit',
    provider: 'fal',
  }
}

const SAMPLE_VIEWS: MultiViewImageRecord[] = [
  makeView('back'),
  makeView('left'),
  makeView('right'),
]

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockAuthState = { isLoaded: true, userId: TEST_CLERK_ID }
})

afterEach(() => {
  window.localStorage.clear()
})

describe('useGenerateMultiView', () => {
  it('writes a cache slot scoped to the active clerkId after generate', async () => {
    mockGenerate.mockResolvedValue({
      success: true,
      data: { views: SAMPLE_VIEWS },
    })
    const { result } = renderHook(() => useGenerateMultiView())

    await act(async () => {
      await result.current.generate(SAMPLE_REQUEST)
    })

    const keys = Object.keys(window.localStorage)
    expect(keys).toHaveLength(1)
    // Cache key embeds the clerkId — A and B can never hash-collide.
    expect(keys[0]).toContain(TEST_CLERK_ID)
  })

  it('does not surface user A cache to user B even on identical imageUrl', async () => {
    // User A generates and caches.
    mockGenerate.mockResolvedValue({
      success: true,
      data: { views: SAMPLE_VIEWS },
    })
    const a = renderHook(() => useGenerateMultiView())
    await act(async () => {
      await a.result.current.generate(SAMPLE_REQUEST)
    })
    a.unmount()

    // User B mounts. restore() must miss — A's cache lives under a
    // different key.
    mockAuthState = { isLoaded: true, userId: OTHER_CLERK_ID }
    const b = renderHook(() => useGenerateMultiView())
    let restored = false
    act(() => {
      restored = b.result.current.restore(SAMPLE_REQUEST)
    })
    expect(restored).toBe(false)
    expect(b.result.current.views).toEqual([])
  })

  it('skips cache reads/writes entirely while Clerk is loading', async () => {
    mockAuthState = { isLoaded: false, userId: null }
    mockGenerate.mockResolvedValue({
      success: true,
      data: { views: SAMPLE_VIEWS },
    })
    const { result } = renderHook(() => useGenerateMultiView())

    expect(result.current.restore(SAMPLE_REQUEST)).toBe(false)

    await act(async () => {
      await result.current.generate(SAMPLE_REQUEST)
    })

    // generate() still works (round-trips the API), but never persists.
    expect(window.localStorage.length).toBe(0)
  })

  it('restore() returns true on cache hit for the same clerkId', async () => {
    mockGenerate.mockResolvedValue({
      success: true,
      data: { views: SAMPLE_VIEWS },
    })
    const { result } = renderHook(() => useGenerateMultiView())

    await act(async () => {
      await result.current.generate(SAMPLE_REQUEST)
    })

    let restored = false
    act(() => {
      result.current.reset()
    })
    await waitFor(() => {
      expect(result.current.views).toEqual([])
    })
    act(() => {
      restored = result.current.restore(SAMPLE_REQUEST)
    })
    expect(restored).toBe(true)
    expect(result.current.views).toHaveLength(3)
  })
})
