import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { IMAGE_GENERATION } from '@/constants/config'
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
  checkMultiViewStatusAPI: vi.fn(),
}))

let mockAuthState: { isLoaded: boolean; userId: string | null } = {
  isLoaded: true,
  userId: 'user_test_clerk_1',
}
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuthState,
}))

import { checkMultiViewStatusAPI, generateMultiViewAPI } from '@/lib/api-client'
import { useGenerateMultiView } from './use-generate-multiview'

const mockGenerate = vi.mocked(generateMultiViewAPI)
const mockCheckStatus = vi.mocked(checkMultiViewStatusAPI)

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

function mockSuccessfulMultiView() {
  mockGenerate.mockResolvedValue({
    success: true,
    data: {
      batchId: 'batch-1',
      jobs: [
        {
          jobId: 'job-back',
          view: 'back',
          prompt: 'back prompt',
          model: 'flux-edit',
          provider: 'fal',
        },
        {
          jobId: 'job-left',
          view: 'left',
          prompt: 'left prompt',
          model: 'flux-edit',
          provider: 'fal',
        },
        {
          jobId: 'job-right',
          view: 'right',
          prompt: 'right prompt',
          model: 'flux-edit',
          provider: 'fal',
        },
      ],
    },
  })
  mockCheckStatus.mockResolvedValue({
    success: true,
    data: {
      batchId: 'batch-1',
      status: 'COMPLETED',
      views: SAMPLE_VIEWS,
      jobs: [],
    },
  })
}

async function generateWithSinglePoll(
  generate: () => Promise<MultiViewImageRecord[]>,
) {
  const promise = generate()
  await vi.advanceTimersByTimeAsync(IMAGE_GENERATION.POLL_INTERVAL_MS)
  return promise
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.localStorage.clear()
  mockAuthState = { isLoaded: true, userId: TEST_CLERK_ID }
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('useGenerateMultiView', () => {
  it('writes a cache slot scoped to the active clerkId after generate', async () => {
    mockSuccessfulMultiView()
    const { result } = renderHook(() => useGenerateMultiView())

    await act(async () => {
      await generateWithSinglePoll(() =>
        result.current.generate(SAMPLE_REQUEST),
      )
    })

    const keys = Object.keys(window.localStorage)
    expect(keys).toHaveLength(1)
    // Cache key embeds the clerkId — A and B can never hash-collide.
    expect(keys[0]).toContain(TEST_CLERK_ID)
  })

  it('does not surface user A cache to user B even on identical imageUrl', async () => {
    // User A generates and caches.
    mockSuccessfulMultiView()
    const a = renderHook(() => useGenerateMultiView())
    await act(async () => {
      await generateWithSinglePoll(() =>
        a.result.current.generate(SAMPLE_REQUEST),
      )
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
    mockSuccessfulMultiView()
    const { result } = renderHook(() => useGenerateMultiView())

    expect(result.current.restore(SAMPLE_REQUEST)).toBe(false)

    await act(async () => {
      await generateWithSinglePoll(() =>
        result.current.generate(SAMPLE_REQUEST),
      )
    })

    // generate() still works (round-trips the API), but never persists.
    expect(window.localStorage.length).toBe(0)
  })

  it('restore() returns true on cache hit for the same clerkId', async () => {
    mockSuccessfulMultiView()
    const { result } = renderHook(() => useGenerateMultiView())

    await act(async () => {
      await generateWithSinglePoll(() =>
        result.current.generate(SAMPLE_REQUEST),
      )
    })

    let restored = false
    act(() => {
      result.current.reset()
    })
    expect(result.current.views).toEqual([])
    act(() => {
      restored = result.current.restore(SAMPLE_REQUEST)
    })
    expect(restored).toBe(true)
    expect(result.current.views).toHaveLength(3)
  })
})
