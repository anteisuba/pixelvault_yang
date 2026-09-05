import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SITEMAP_MAX_URLS, SITEMAP_QUERY_BATCH_SIZE } from '@/constants/config'

const getPublicGenerations = vi.fn()
const listPublicCreatorUsernames = vi.fn()

vi.mock('@/services/generation.service', () => ({
  getPublicGenerations: (...args: unknown[]) => getPublicGenerations(...args),
}))

vi.mock('@/services/user.service', () => ({
  listPublicCreatorUsernames: (...args: unknown[]) =>
    listPublicCreatorUsernames(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}))

const LOCALE_COUNT = 3
const STATIC_ROUTES_PER_LOCALE = 2

function makeGenerations(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `gen-${offset + i}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }))
}

async function runSitemap() {
  const { default: sitemap } = await import('./sitemap')
  return sitemap()
}

describe('sitemap', () => {
  beforeEach(() => {
    vi.resetModules()
    getPublicGenerations.mockReset()
    listPublicCreatorUsernames.mockReset()
    getPublicGenerations.mockResolvedValue([])
    listPublicCreatorUsernames.mockResolvedValue([])
  })

  it('emits the static routes for every locale', async () => {
    const entries = await runSitemap()

    expect(entries).toHaveLength(LOCALE_COUNT * STATIC_ROUTES_PER_LOCALE)
    expect(getPublicGenerations).toHaveBeenCalledWith({
      page: 1,
      limit: SITEMAP_QUERY_BATCH_SIZE,
    })
    expect(listPublicCreatorUsernames).toHaveBeenCalledWith({
      page: 1,
      limit: SITEMAP_QUERY_BATCH_SIZE,
    })
  })

  it('stops walking after a short batch', async () => {
    getPublicGenerations.mockResolvedValueOnce(makeGenerations(2))

    const entries = await runSitemap()

    expect(getPublicGenerations).toHaveBeenCalledTimes(1)
    expect(entries).toHaveLength(
      LOCALE_COUNT * STATIC_ROUTES_PER_LOCALE + 2 * LOCALE_COUNT,
    )
  })

  it('keeps paging while batches come back full', async () => {
    getPublicGenerations
      .mockResolvedValueOnce(makeGenerations(SITEMAP_QUERY_BATCH_SIZE))
      .mockResolvedValueOnce(makeGenerations(1, SITEMAP_QUERY_BATCH_SIZE))

    await runSitemap()

    expect(getPublicGenerations).toHaveBeenCalledTimes(2)
    expect(getPublicGenerations).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: SITEMAP_QUERY_BATCH_SIZE,
    })
  })

  it('keeps the entries collected before a failing batch', async () => {
    getPublicGenerations
      .mockResolvedValueOnce(makeGenerations(SITEMAP_QUERY_BATCH_SIZE))
      .mockRejectedValueOnce(new Error('db down'))

    const entries = await runSitemap()

    expect(entries).toHaveLength(
      LOCALE_COUNT * STATIC_ROUTES_PER_LOCALE +
        SITEMAP_QUERY_BATCH_SIZE * LOCALE_COUNT,
    )
  })

  it('still emits the static routes when both readers fail', async () => {
    getPublicGenerations.mockRejectedValue(new Error('db down'))
    listPublicCreatorUsernames.mockRejectedValue(new Error('db down'))

    const entries = await runSitemap()

    expect(entries).toHaveLength(LOCALE_COUNT * STATIC_ROUTES_PER_LOCALE)
  })

  it('includes public creator profiles', async () => {
    listPublicCreatorUsernames.mockResolvedValueOnce(['alice', 'bob'])

    const entries = await runSitemap()
    const creatorUrls = entries.filter((entry) => entry.url.includes('/u/'))

    expect(creatorUrls).toHaveLength(2 * LOCALE_COUNT)
    expect(creatorUrls.some((entry) => entry.url.endsWith('/u/alice'))).toBe(
      true,
    )
  })

  it('truncates at the single-file URL ceiling', async () => {
    const fullBatches = Math.ceil(SITEMAP_MAX_URLS / SITEMAP_QUERY_BATCH_SIZE)
    for (let i = 0; i < fullBatches; i += 1) {
      getPublicGenerations.mockResolvedValueOnce(
        makeGenerations(SITEMAP_QUERY_BATCH_SIZE, i * SITEMAP_QUERY_BATCH_SIZE),
      )
    }

    const entries = await runSitemap()

    expect(entries).toHaveLength(SITEMAP_MAX_URLS)
  })
})
