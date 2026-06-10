import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { LoraAssetRecord } from '@/types'
import {
  LoraStackProvider,
  parseStyleParams,
  serializeStackForUrl,
  useActiveLoraStack,
} from './use-active-lora-stack'

vi.mock('@/lib/api-client/lora-assets', () => ({
  getLoraAssetByCodeAPI: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

// Default mock returns user A signed-in. Individual tests can re-mock
// per case (e.g. parked / cross-account) via mockClerkAuth.
const TEST_CLERK_ID = 'user_test_clerk_1'
const OTHER_CLERK_ID = 'user_test_clerk_2'
const STORAGE_KEY_PREFIX = 'pv.active-lora-stack.v2'
const LEGACY_GLOBAL_STORAGE_KEY = 'pv.active-lora-stack.v1'

function getStorageKey(clerkId: string): string {
  return `${STORAGE_KEY_PREFIX}.${clerkId}`
}

let mockAuthState: { isLoaded: boolean; userId: string | null } = {
  isLoaded: true,
  userId: TEST_CLERK_ID,
}

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuthState,
}))

function mockClerkAuth(state: { isLoaded: boolean; userId: string | null }) {
  mockAuthState = state
}

import { getLoraAssetByCodeAPI } from '@/lib/api-client/lora-assets'
const mockGet = vi.mocked(getLoraAssetByCodeAPI)

function makeAsset(overrides: Partial<LoraAssetRecord> = {}): LoraAssetRecord {
  return {
    id: 'a1',
    styleCode: 'pv-c-test-aa11',
    name: 'Test LoRA',
    source: 'curated',
    type: 'subject',
    baseModelFamily: 'flux',
    provider: 'fal',
    triggerWord: 'pv_test',
    loraUrl: 'https://example.com/x.safetensors',
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1.0,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <LoraStackProvider>{children}</LoraStackProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
  // Reset to "User A signed in" before every test.
  mockClerkAuth({ isLoaded: true, userId: TEST_CLERK_ID })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('useActiveLoraStack', () => {
  it('starts empty when there is no storage and no URL param', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })
    expect(result.current.items).toEqual([])
    expect(result.current.toActiveLoras()).toEqual([])
  })

  it('hydrates from localStorage on mount', async () => {
    const asset = makeAsset()
    window.localStorage.setItem(
      getStorageKey(TEST_CLERK_ID),
      JSON.stringify({
        ownerClerkId: TEST_CLERK_ID,
        items: [{ asset, scale: 0.8 }],
      }),
    )

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.items[0]?.asset.id).toBe('a1')
    expect(result.current.toActiveLoras()).toEqual([
      { assetId: 'a1', styleCode: 'pv-c-test-aa11', scale: 0.8 },
    ])
  })

  it('push adds an asset and persists it', async () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })
    const asset = makeAsset()

    act(() => {
      result.current.push(asset)
    })

    expect(result.current.items).toHaveLength(1)
    await waitFor(() => {
      const raw = window.localStorage.getItem(getStorageKey(TEST_CLERK_ID))
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.ownerClerkId).toBe(TEST_CLERK_ID)
      expect(parsed.items[0].asset.id).toBe('a1')
    })
  })

  it('push deduplicates by asset id', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })
    const asset = makeAsset()

    act(() => {
      result.current.push(asset)
      result.current.push(asset)
    })

    expect(result.current.items).toHaveLength(1)
  })

  it('respects MAX_STACK cap', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    act(() => {
      result.current.push(makeAsset({ id: '1', styleCode: 'c1' }))
      result.current.push(makeAsset({ id: '2', styleCode: 'c2' }))
      result.current.push(makeAsset({ id: '3', styleCode: 'c3' }))
      result.current.push(makeAsset({ id: '4', styleCode: 'c4' })) // dropped
    })

    expect(result.current.items.map((i) => i.asset.id)).toEqual(['1', '2', '3'])
  })

  it('push fires a mount event that acknowledge clears', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    act(() => {
      result.current.push(
        makeAsset({ id: '1', name: 'Nivora', styleCode: 'c1' }),
      )
    })

    expect(result.current.mountEvent).toMatchObject({
      assetId: '1',
      assetName: 'Nivora',
    })
    expect(typeof result.current.mountEvent?.at).toBe('number')

    act(() => {
      result.current.acknowledgeMountEvent()
    })
    expect(result.current.mountEvent).toBeNull()
  })

  it('re-pushing an already mounted asset does not re-fire the mount event', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })
    const asset = makeAsset({ id: '1', styleCode: 'c1' })

    act(() => {
      result.current.push(asset)
    })
    act(() => {
      result.current.acknowledgeMountEvent()
    })
    act(() => {
      result.current.push(asset) // duplicate — stack unchanged
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.mountEvent).toBeNull()
  })

  it('resolving ?style= fires a mount event for the added LoRA', async () => {
    const asset = makeAsset({
      id: 'url1',
      name: 'Shared LoRA',
      styleCode: 'pv-x',
    })
    mockGet.mockResolvedValue({ success: true, data: asset })
    mockSearchParams.set('style', 'pv-x')

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.mountEvent).toMatchObject({
      assetId: 'url1',
      assetName: 'Shared LoRA',
    })
  })

  it('setScale updates a single entry without disturbing others', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    act(() => {
      result.current.push(makeAsset({ id: '1', styleCode: 'c1' }))
      result.current.push(makeAsset({ id: '2', styleCode: 'c2' }))
      result.current.setScale('1', 0.5)
    })

    expect(result.current.items[0]?.scale).toBe(0.5)
    expect(result.current.items[1]?.scale).toBeUndefined()
    expect(result.current.toActiveLoras()).toEqual([
      { assetId: '1', styleCode: 'c1', scale: 0.5 },
      { assetId: '2', styleCode: 'c2', scale: 1.0 }, // falls back to defaultScale
    ])
  })

  it('remove drops a single asset; clear empties the stack', () => {
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    act(() => {
      result.current.push(makeAsset({ id: '1', styleCode: 'c1' }))
      result.current.push(makeAsset({ id: '2', styleCode: 'c2' }))
      result.current.remove('1')
    })
    expect(result.current.items.map((i) => i.asset.id)).toEqual(['2'])

    act(() => {
      result.current.clear()
    })
    expect(result.current.items).toEqual([])
  })

  it('resolves ?style=<code> on mount and pushes onto the stack', async () => {
    mockSearchParams.set('style', 'pv-c-test-aa11')
    const asset = makeAsset()
    mockGet.mockResolvedValue({ success: true, data: asset })

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })
    expect(result.current.items[0]?.asset.id).toBe('a1')
    expect(mockGet).toHaveBeenCalledWith('pv-c-test-aa11')
  })

  it('silently skips ?style=<code> codes that fail to resolve', async () => {
    mockSearchParams.set('style', 'missing')
    mockGet.mockResolvedValue({ success: false, error: 'Not found' })

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.isResolvingFromUrl).toBe(false)
    })
    expect(result.current.items).toEqual([])
  })

  it('parses ?style=a,b multi codes into the stack in order', async () => {
    mockSearchParams.set('style', 'pv-c-a-aaaa,pv-c-b-bbbb')
    mockGet.mockImplementation(async (code: string) => ({
      success: true,
      data: makeAsset({ id: code, styleCode: code }),
    }))

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
    })
    expect(result.current.items.map((entry) => entry.asset.id)).toEqual([
      'pv-c-a-aaaa',
      'pv-c-b-bbbb',
    ])
  })

  it('parses ?style=code:scale to apply a per-LoRA scale override', async () => {
    mockSearchParams.set('style', 'pv-c-a-aaaa:0.6,pv-c-b-bbbb')
    mockGet.mockImplementation(async (code: string) => ({
      success: true,
      data: makeAsset({ id: code, styleCode: code }),
    }))

    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2)
    })
    expect(result.current.items[0]?.scale).toBe(0.6)
    expect(result.current.items[1]?.scale).toBeUndefined()
  })

  it('refuses to hydrate a snapshot whose ownerClerkId does not match', async () => {
    // Plant a snapshot under user A's key but with B's ownerClerkId.
    window.localStorage.setItem(
      getStorageKey(TEST_CLERK_ID),
      JSON.stringify({
        ownerClerkId: OTHER_CLERK_ID,
        items: [{ asset: makeAsset(), scale: 0.5 }],
      }),
    )
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })
    await waitFor(() => {
      expect(result.current.items).toEqual([])
    })
  })

  it('scopes storage per clerkId so two accounts cannot see each other', async () => {
    // User A writes a stack.
    const { result: aResult, unmount: unmountA } = renderHook(
      () => useActiveLoraStack(),
      { wrapper },
    )
    act(() => {
      aResult.current.push(makeAsset({ id: '1', styleCode: 'c1' }))
    })
    await waitFor(() => {
      expect(
        window.localStorage.getItem(getStorageKey(TEST_CLERK_ID)),
      ).toBeTruthy()
    })
    expect(
      window.localStorage.getItem(getStorageKey(OTHER_CLERK_ID)),
    ).toBeNull()
    unmountA()

    // User B mounts and sees nothing.
    mockClerkAuth({ isLoaded: true, userId: OTHER_CLERK_ID })
    const { result: bResult } = renderHook(() => useActiveLoraStack(), {
      wrapper,
    })
    await waitFor(() => {
      expect(bResult.current.items).toEqual([])
    })
  })

  it('parks itself while Clerk is still loading', () => {
    mockClerkAuth({ isLoaded: false, userId: null })
    const { result } = renderHook(() => useActiveLoraStack(), { wrapper })

    act(() => {
      result.current.push(makeAsset())
    })
    // The push lands in memory, but never writes localStorage while
    // parked. Reload would discard the entry — exactly what we want for
    // a signed-out / pre-auth state.
    expect(window.localStorage.length).toBe(0)
  })

  it('purges the pre-v2 global localStorage key on mount', () => {
    window.localStorage.setItem(
      LEGACY_GLOBAL_STORAGE_KEY,
      JSON.stringify([{ asset: makeAsset() }]),
    )
    renderHook(() => useActiveLoraStack(), { wrapper })
    expect(window.localStorage.getItem(LEGACY_GLOBAL_STORAGE_KEY)).toBeNull()
  })
})

describe('parseStyleParams', () => {
  it('returns an empty list for empty input', () => {
    expect(parseStyleParams([])).toEqual([])
    expect(parseStyleParams([''])).toEqual([])
  })

  it('parses a single bare code', () => {
    expect(parseStyleParams(['pv-c-a-aaaa'])).toEqual([{ code: 'pv-c-a-aaaa' }])
  })

  it('parses comma-separated codes preserving order', () => {
    expect(parseStyleParams(['a,b,c'])).toEqual([
      { code: 'a' },
      { code: 'b' },
      { code: 'c' },
    ])
  })

  it('parses code:scale tokens', () => {
    expect(parseStyleParams(['a:0.8,b:1.2'])).toEqual([
      { code: 'a', scale: 0.8 },
      { code: 'b', scale: 1.2 },
    ])
  })

  it('drops invalid scales but keeps the code', () => {
    expect(parseStyleParams(['a:abc'])).toEqual([{ code: 'a' }])
    expect(parseStyleParams(['a:-1'])).toEqual([{ code: 'a' }])
  })

  it('merges repeated ?style= query values in order', () => {
    expect(parseStyleParams(['a:0.5', 'b,c:1.1'])).toEqual([
      { code: 'a', scale: 0.5 },
      { code: 'b' },
      { code: 'c', scale: 1.1 },
    ])
  })
})

describe('serializeStackForUrl', () => {
  it('returns an empty string for an empty stack', () => {
    expect(serializeStackForUrl([])).toBe('')
  })

  it('omits :scale when the entry uses the asset default', () => {
    const asset = makeAsset({ defaultScale: 1.0 })
    expect(serializeStackForUrl([{ asset, scale: 1.0 }])).toBe(asset.styleCode)
    expect(serializeStackForUrl([{ asset }])).toBe(asset.styleCode)
  })

  it('includes :scale only when it differs from the default', () => {
    const asset = makeAsset({ defaultScale: 1.0, styleCode: 'pv-c-x-xxxx' })
    expect(serializeStackForUrl([{ asset, scale: 0.8 }])).toBe(
      'pv-c-x-xxxx:0.8',
    )
  })

  it('joins multiple entries with commas in stack order', () => {
    const a = makeAsset({ id: 'a', styleCode: 'a', defaultScale: 1.0 })
    const b = makeAsset({ id: 'b', styleCode: 'b', defaultScale: 1.0 })
    expect(serializeStackForUrl([{ asset: a, scale: 0.5 }, { asset: b }])).toBe(
      'a:0.5,b',
    )
  })

  it('round-trips through parseStyleParams', () => {
    const a = makeAsset({ id: 'a', styleCode: 'a', defaultScale: 1.0 })
    const b = makeAsset({ id: 'b', styleCode: 'b', defaultScale: 1.0 })
    const serialized = serializeStackForUrl([
      { asset: a, scale: 0.75 },
      { asset: b, scale: 1.0 }, // default → no :scale suffix
    ])
    expect(parseStyleParams([serialized])).toEqual([
      { code: 'a', scale: 0.75 },
      { code: 'b' },
    ])
  })
})
