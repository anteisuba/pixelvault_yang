import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/civitai-lora.service', () => ({
  listCivitaiLoras: vi.fn(),
}))

import { listCivitaiLoras } from '@/services/civitai-lora.service'

import { GET } from './route'

const mockListCivitaiLoras = vi.mocked(listCivitaiLoras)

const emptyResult = {
  items: [],
  page: 1,
  pageSize: 12,
  total: 0,
  hasNextPage: false,
  nextCursor: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListCivitaiLoras.mockResolvedValue(emptyResult)
})

describe('GET /api/lora-assets/civitai', () => {
  it('defaults nsfwFilter to safe when the query param is absent', async () => {
    const response = await GET(createGET('/api/lora-assets/civitai', {}))
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ nsfwFilter: 'safe' }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  // P1-6 三态：任何不在 (unrestricted/nsfwOnly/safe) 白名单里的值都必须
  // 静默落回默认（safe），不能透传给 civitai。
  it.each(['0', '1', 'true', 'garbage'])(
    'treats nsfw=%s as safe (not a valid tri-state value)',
    async (value) => {
      const response = await GET(
        createGET('/api/lora-assets/civitai', { nsfw: value }),
      )

      expect(response.status).toBe(200)
      expect(mockListCivitaiLoras).toHaveBeenCalledWith(
        expect.objectContaining({ nsfwFilter: 'safe' }),
        expect.objectContaining({ defer: expect.any(Function) }),
      )
    },
  )

  it('passes nsfwFilter=safe through when the query param is exactly "safe"', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { nsfw: 'safe' }),
    )

    expect(response.status).toBe(200)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ nsfwFilter: 'safe' }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  it('passes nsfwFilter=nsfwOnly through when the query param is exactly "nsfwOnly"', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { nsfw: 'nsfwOnly' }),
    )

    expect(response.status).toBe(200)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ nsfwFilter: 'nsfwOnly' }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  it('rejects invalid baseModel/sort values', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { baseModel: 'not-a-model' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockListCivitaiLoras).not.toHaveBeenCalled()
  })

  // Search-session backend lock: the search
  // pagination hook locks onto a backend after page 1 and threads it back
  // as `source` on subsequent pages so the session doesn't silently swap
  // pagination paradigms (offset vs. cursor-scan) mid-flight.
  it.each(['meilisearch', 'rest'])(
    'passes source=%s through to the service',
    async (source) => {
      const response = await GET(
        createGET('/api/lora-assets/civitai', { source }),
      )

      expect(response.status).toBe(200)
      expect(mockListCivitaiLoras).toHaveBeenCalledWith(
        expect.objectContaining({ source }),
        expect.objectContaining({ defer: expect.any(Function) }),
      )
    },
  )

  it('silently drops an unknown source value instead of 400ing', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { source: 'garbage' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ source: undefined }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  it('omits source when the query param is absent', async () => {
    const response = await GET(createGET('/api/lora-assets/civitai', {}))

    expect(response.status).toBe(200)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ source: undefined }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  // S2（docs/references/pages/lora-workbench.md §2.5/§3）：URL `type=` 直通
  // 到 service 的 `contentType` 字段（改名，不是同名透传）。
  it('defaults contentType to all when type is absent', async () => {
    const response = await GET(createGET('/api/lora-assets/civitai', {}))

    expect(response.status).toBe(200)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'all' }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  it('passes type=clothing through to the service as contentType', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { type: 'clothing' }),
    )

    expect(response.status).toBe(200)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'clothing' }),
      expect.objectContaining({ defer: expect.any(Function) }),
    )
  })

  it('rejects an invalid type value', async () => {
    const response = await GET(
      createGET('/api/lora-assets/civitai', { type: 'not-a-type' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockListCivitaiLoras).not.toHaveBeenCalled()
  })

  it('keeps a stale (served-early) page out of the edge cache', async () => {
    mockListCivitaiLoras.mockResolvedValue({
      ...emptyResult,
      stale: true,
      fetchedAt: '2026-09-27T10:00:00.000Z',
    })

    const response = await GET(createGET('/api/lora-assets/civitai', {}))

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Server-Timing')).toContain(
      'snapshot;desc="stale"',
    )
  })

  it('caches a live page at the edge and reports where the time went', async () => {
    mockListCivitaiLoras.mockImplementation(async (_input, options) => {
      if (options?.timing) options.timing.upstreamMs = 312
      return emptyResult
    })

    const response = await GET(createGET('/api/lora-assets/civitai', {}))

    expect(response.headers.get('Cache-Control')).toContain('s-maxage=900')
    const serverTiming = response.headers.get('Server-Timing') ?? ''
    expect(serverTiming).toContain('upstream;dur=312')
    expect(serverTiming).toMatch(/total;dur=\d+/)
  })
})
