// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadAssetBatch,
  getAssetDownloadDescriptor,
} from '@/features/assets/lib/bulk-download'
import type { GenerationRecord } from '@/types'

function makeGen(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    id: '11111111-aaaa-bbbb-cccc-000000000001',
    url: 'https://cdn.example.com/a.png',
    prompt: 'test',
    model: 'flux',
    provider: 'fal',
    outputType: 'IMAGE',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    isPublic: false,
    isPromptPublic: false,
    isLiked: false,
    likeCount: 0,
    createdAt: '2026-11-26T00:00:00.000Z',
    ...overrides,
  } as GenerationRecord
}

describe('bulk-download', () => {
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalUserAgent = navigator.userAgent
  let clickedLinks: Array<{ download: string; href: string }>

  beforeEach(() => {
    vi.clearAllMocks()
    clickedLinks = []
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: undefined,
    })
    URL.createObjectURL = vi.fn(() => 'blob:mock-download')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedLinks.push({ download: this.download, href: this.href })
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    })
    vi.restoreAllMocks()
  })

  it('builds descriptor for images and 3D models', () => {
    expect(getAssetDownloadDescriptor(makeGen())).toEqual({
      url: 'https://cdn.example.com/a.png',
      fileName: 'antei-11111111.png',
    })
    expect(
      getAssetDownloadDescriptor(
        makeGen({
          id: '22222222-aaaa-bbbb-cccc-000000000002',
          outputType: 'MODEL_3D',
          modelUrl: 'https://cdn.example.com/mesh.glb',
        }),
      ),
    ).toEqual({
      url: 'https://cdn.example.com/mesh.glb',
      fileName: 'antei-22222222.glb',
    })
  })

  it('downloads a single selected asset directly without wrapping in ZIP', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: async () => new Blob(['single-img'], { type: 'image/png' }),
    })) as unknown as typeof fetch

    const progress = vi.fn()
    const result = await downloadAssetBatch([makeGen()], {
      onProgress: progress,
    })

    expect(result).toEqual({ kind: 'single', downloaded: 1, failed: 0 })
    expect(clickedLinks).toEqual([
      { download: 'antei-11111111.png', href: 'blob:mock-download' },
    ])
    expect(progress).toHaveBeenLastCalledWith(1, 1)
  })

  it('packs multiple assets into a single ZIP on desktop/Android and reports progress', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: async () => new Blob(['bytes'], { type: 'image/png' }),
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const progress = vi.fn()
    const items = [
      makeGen({ id: 'aaaaaaaa-0001', url: 'https://cdn.example.com/1.png' }),
      makeGen({ id: 'bbbbbbbb-0002', url: 'https://cdn.example.com/2.png' }),
    ]

    const result = await downloadAssetBatch(items, { onProgress: progress })

    expect(result).toEqual({ kind: 'zip', downloaded: 2, failed: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(clickedLinks).toHaveLength(1)
    expect(clickedLinks[0].download).toMatch(/^antei-assets-\d{8}-\d{4}\.zip$/)
    expect(progress).toHaveBeenLastCalledWith(2, 2)
  })

  it('uses iOS multi-file share sheet when all items are photos/videos on iOS', async () => {
    const shareMock = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareMock,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => true),
    })
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: async () => new Blob(['img'], { type: 'image/png' }),
    })) as unknown as typeof fetch

    const items = [
      makeGen({ id: 'aaaaaaaa-0001', url: 'https://cdn.example.com/1.png' }),
      makeGen({ id: 'bbbbbbbb-0002', url: 'https://cdn.example.com/2.png' }),
    ]

    const result = await downloadAssetBatch(items)

    expect(result).toEqual({ kind: 'photos', downloaded: 2, failed: 0 })
    expect(shareMock).toHaveBeenCalledTimes(1)
    const sharedArg = (
      shareMock.mock.calls[0] as unknown as [{ files: File[] }]
    )[0]
    expect(sharedArg.files).toHaveLength(2)
    expect(clickedLinks).toHaveLength(0)
  })

  it('still downloads a ZIP with succeeded files when one asset fails to fetch', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('1.png')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          blob: async () => new Blob(['ok'], { type: 'image/png' }),
        }
      }
      return { ok: false, status: 404, headers: new Headers() }
    }) as unknown as typeof fetch

    const items = [
      makeGen({ id: 'aaaaaaaa-0001', url: 'https://cdn.example.com/1.png' }),
      makeGen({ id: 'bbbbbbbb-0002', url: 'https://cdn.example.com/2.png' }),
    ]

    const result = await downloadAssetBatch(items)

    expect(result).toEqual({ kind: 'zip', downloaded: 1, failed: 1 })
    expect(clickedLinks).toHaveLength(1)
  })
})
