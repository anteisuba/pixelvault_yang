import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CRON_HEARTBEAT } from '@/constants/cron'
import { CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL } from '@/constants/lora'

import {
  listCivitaiLoras,
  readCivitaiIndexHeartbeat,
} from './civitai-lora-library.service'

const mockFetch = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const indexRow = {
  modelId: 11,
  versionId: 110,
  versionName: 'v2',
  name: 'Silver Hair',
  creator: 'maker',
  creatorImage: null,
  nsfw: false,
  baseModel: 'Illustrious',
  tags: ['character', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  trainedWords: ['silver_hair'],
  hashAutoV3: 'ABC123',
  downloadCount: 40,
  thumbsUpCount: 4,
  images: [
    { id: 1, url: 'explicit-uuid', nsfwLevel: 16 },
    { id: 2, url: 'safe-uuid', nsfwLevel: 1 },
  ],
  permissions: {
    allowCommercialUse: ['Image'],
    allowDerivatives: true,
    allowNoCredit: false,
  },
  createdAt: Date.parse('2026-01-02T00:00:00.000Z'),
}

function lastRequestBody(): Record<string, unknown> {
  const init = mockFetch.mock.calls.at(-1)?.[1]
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('CIVITAI_INDEX_URL', 'https://index.test')
  vi.stubEnv('CIVITAI_INDEX_TOKEN', 'index-token')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('listCivitaiLoras', () => {
  it('translates library filters into an index query', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [], total: 0 }))

    await listCivitaiLoras({
      search: ' silver ',
      baseModel: 'Illustrious',
      contentType: 'clothing',
      page: 2,
      pageSize: 24,
    })

    const [url, init] = mockFetch.mock.calls[0] ?? []
    expect(String(url)).toBe('https://index.test/search')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer index-token',
    )
    expect(lastRequestBody()).toEqual({
      q: 'silver',
      baseModels: ['Illustrious', 'NoobAI'],
      nsfw: { someImageAtMost: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      contentType: {
        tags: ['clothing', 'outfit', 'costume'],
        nameKeywords: ['outfit', 'dress', 'uniform', 'costume'],
      },
      sort: 'relevance',
      page: 2,
      pageSize: 24,
    })
  })

  it.each([
    [{ sort: 'Highest Rated' as const }, { sort: 'thumbs' }],
    [{ sort: 'Most Downloaded' as const }, { sort: 'downloads' }],
    [{ sort: 'Newest' as const }, { sort: 'newest' }],
    [
      { nsfwFilter: 'nsfwOnly' as const },
      { nsfw: { someImageAbove: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL } },
    ],
    [{ nsfwFilter: 'unrestricted' as const }, { nsfw: {} }],
    [{ contentType: 'all' as const }, { contentType: null }],
  ])('maps %o to %o', async (input, expected) => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [], total: 0 }))

    await listCivitaiLoras(input)

    expect(lastRequestBody()).toMatchObject(expected)
  })

  it('treats the "other" bucket as every base model outside the named families', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [], total: 0 }))

    await listCivitaiLoras({ baseModel: 'other' })

    const body = lastRequestBody()
    expect(body.baseModels).toBeUndefined()
    expect(body.excludeBaseModels).toEqual(
      expect.arrayContaining(['Illustrious', 'NoobAI', 'Pony', 'SD 1.5']),
    )
  })

  it('maps index rows to library items with an exact total', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [indexRow], total: 25 }))

    const result = await listCivitaiLoras({ page: 2, pageSize: 12 })

    expect(result).toMatchObject({
      page: 2,
      pageSize: 12,
      total: 25,
      hasNextPage: true,
    })
    const [item] = result.items
    expect(item).toMatchObject({
      id: 'civitai:11:110',
      styleCode: 'civitai-110',
      loraUrl: 'https://civitai.com/api/download/models/110',
      modelPageUrl: 'https://civitai.com/models/11?modelVersionId=110',
      baseModelFamily: 'Illustrious',
      fileHashAutoV3: 'ABC123',
      creatorName: 'maker',
      allowCommercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
      isNsfw: false,
      createdAt: '2026-01-02T00:00:00.000Z',
    })
    expect(item?.tags).toHaveLength(8)
    // 安全档只放安全的图当封面。
    expect(item?.coverImageUrlOriginal).toContain('safe-uuid')
  })

  it('fails loudly when the index is not configured', async () => {
    vi.stubEnv('CIVITAI_INDEX_URL', '')

    await expect(listCivitaiLoras()).rejects.toThrow(/not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fails when the index responds with an error', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(listCivitaiLoras()).rejects.toThrow(/responded 500/)
  })
})

describe('readCivitaiIndexHeartbeat', () => {
  const now = Date.parse('2026-10-08T00:00:00.000Z')

  it('is healthy after a recent clean sync', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        last_completed_at: now - 60 * 60 * 1000,
        last_error: null,
        row_count: 700_000,
      }),
    )

    expect(await readCivitaiIndexHeartbeat(now)).toMatchObject({
      name: 'civitai-index-sync',
      stale: false,
      healthy: true,
      ageMs: 60 * 60 * 1000,
    })
  })

  it('reports a failed run with its error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        last_completed_at: now - 60 * 60 * 1000,
        last_error: 'Civitai search responded 503',
      }),
    )

    const heartbeat = await readCivitaiIndexHeartbeat(now)
    expect(heartbeat.healthy).toBe(false)
    expect(heartbeat.lastRun?.detail).toBe('Civitai search responded 503')
  })

  it('goes stale when the last sync is older than the heartbeat window', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        last_completed_at: now - CRON_HEARTBEAT.MAX_AGE_MS - 1,
        last_error: null,
      }),
    )

    expect(await readCivitaiIndexHeartbeat(now)).toMatchObject({
      stale: true,
      healthy: false,
    })
  })

  it('is unhealthy, not blind, when the index cannot be reached', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    const heartbeat = await readCivitaiIndexHeartbeat(now)
    expect(heartbeat.healthy).toBe(false)
    expect(heartbeat.lastRun?.detail).toContain('network down')
  })
})
