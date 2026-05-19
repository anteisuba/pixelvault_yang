import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { LoraAssetRecord } from '@/types'
import { LoraStackProvider, useActiveLoraStack } from './use-active-lora-stack'

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

const STORAGE_KEY = 'pv.active-lora-stack.v1'

function wrapper({ children }: { children: React.ReactNode }) {
  return <LoraStackProvider>{children}</LoraStackProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  // reset URL search params between tests
  mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
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
      STORAGE_KEY,
      JSON.stringify([{ asset, scale: 0.8 }]),
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
      const raw = window.localStorage.getItem(STORAGE_KEY)
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw!)[0].asset.id).toBe('a1')
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
})
