import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SITEMAP_PAGE_SIZE } from '@/constants/config'

const countPublicGenerations = vi.fn()
const getPublicGenerations = vi.fn()
const countPublicCreators = vi.fn()
const listPublicCreatorUsernames = vi.fn()

vi.mock('@/services/generation.service', () => ({
  countPublicGenerations: (...args: unknown[]) =>
    countPublicGenerations(...args),
  getPublicGenerations: (...args: unknown[]) => getPublicGenerations(...args),
}))

vi.mock('@/services/user.service', () => ({
  countPublicCreators: (...args: unknown[]) => countPublicCreators(...args),
  listPublicCreatorUsernames: (...args: unknown[]) =>
    listPublicCreatorUsernames(...args),
}))

import sitemap, { generateSitemaps } from './sitemap'

describe('generateSitemaps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits exactly one generations page at the SITEMAP_PAGE_SIZE boundary', async () => {
    countPublicGenerations.mockResolvedValue(SITEMAP_PAGE_SIZE)
    countPublicCreators.mockResolvedValue(0)

    const segments = await generateSitemaps()

    expect(segments).toEqual([{ id: 'static' }, { id: 'generations-1' }])
  })

  it('spills into a second generations page one URL past the boundary', async () => {
    countPublicGenerations.mockResolvedValue(SITEMAP_PAGE_SIZE + 1)
    countPublicCreators.mockResolvedValue(0)

    const segments = await generateSitemaps()

    expect(segments).toEqual([
      { id: 'static' },
      { id: 'generations-1' },
      { id: 'generations-2' },
    ])
  })

  it('always includes at least one generations page even with zero public generations', async () => {
    countPublicGenerations.mockResolvedValue(0)
    countPublicCreators.mockResolvedValue(0)

    const segments = await generateSitemaps()

    expect(segments).toEqual([{ id: 'static' }, { id: 'generations-1' }])
  })

  it('omits the creators segment entirely when there are no public creators', async () => {
    countPublicGenerations.mockResolvedValue(0)
    countPublicCreators.mockResolvedValue(0)

    const segments = await generateSitemaps()

    expect(segments.some((s) => s.id.startsWith('creators-'))).toBe(false)
  })

  it('paginates creators the same way as generations', async () => {
    countPublicGenerations.mockResolvedValue(0)
    countPublicCreators.mockResolvedValue(SITEMAP_PAGE_SIZE + 1)

    const segments = await generateSitemaps()

    expect(segments).toEqual([
      { id: 'static' },
      { id: 'generations-1' },
      { id: 'creators-1' },
      { id: 'creators-2' },
    ])
  })

  it('falls back to zero counts when the count queries reject', async () => {
    countPublicGenerations.mockRejectedValue(new Error('db down'))
    countPublicCreators.mockRejectedValue(new Error('db down'))

    const segments = await generateSitemaps()

    expect(segments).toEqual([{ id: 'static' }, { id: 'generations-1' }])
  })
})

describe('sitemap()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one static entry per locale for the static segment', async () => {
    const entries = await sitemap({ id: Promise.resolve('static') })

    // 3 locales x 4 static routes
    expect(entries).toHaveLength(12)
    expect(getPublicGenerations).not.toHaveBeenCalled()
    expect(listPublicCreatorUsernames).not.toHaveBeenCalled()
  })

  it('fetches the requested page for a generations segment', async () => {
    getPublicGenerations.mockResolvedValue([
      { id: 'gen-1', createdAt: new Date('2026-01-01') },
    ])

    const entries = await sitemap({ id: Promise.resolve('generations-2') })

    expect(getPublicGenerations).toHaveBeenCalledWith({
      page: 2,
      limit: SITEMAP_PAGE_SIZE,
    })
    expect(entries).toHaveLength(3) // 1 generation x 3 locales
  })

  it('fetches the requested page for a creators segment', async () => {
    listPublicCreatorUsernames.mockResolvedValue(['alice'])

    const entries = await sitemap({ id: Promise.resolve('creators-1') })

    expect(listPublicCreatorUsernames).toHaveBeenCalledWith({
      page: 1,
      limit: SITEMAP_PAGE_SIZE,
    })
    expect(entries).toHaveLength(3) // 1 creator x 3 locales
  })

  it('returns an empty sitemap for an unrecognized segment id', async () => {
    const entries = await sitemap({ id: Promise.resolve('bogus') })

    expect(entries).toEqual([])
  })

  it('falls back to an empty segment when the generations query rejects', async () => {
    getPublicGenerations.mockRejectedValue(new Error('db down'))

    const entries = await sitemap({ id: Promise.resolve('generations-1') })

    expect(entries).toEqual([])
  })
})
