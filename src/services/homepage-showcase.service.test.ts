import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerationFindMany = vi.hoisted(() => vi.fn())

/* The two curation lists are `const` in the real module. Swapping them for
   mutable holders is what lets a test state its own whitelist. */
const curation = vi.hoisted(() => ({
  pinned: [] as string[],
  blocklist: [] as string[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
  },
}))

vi.mock('@/constants/homepage-v4', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/constants/homepage-v4')>()
  return {
    ...actual,
    get HOME_V4_SHOWCASE_PINNED() {
      return curation.pinned
    },
    get HOME_V4_SHOWCASE_BLOCKLIST() {
      return curation.blocklist
    },
  }
})

import {
  HOME_V4_SHOWCASE,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
} from '@/constants/homepage-v4'

import { getHomeV4ShowcaseShots } from './homepage-showcase.service'

const MIN_TOTAL = HOME_V4_SHOWCASE.CELL_COUNT + HOME_V4_SHOWCASE.SPARE_COUNT

/** A portrait row, the shape the showcase select asks for. */
function row(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    thumbnailUrl: `https://cdn.example/${id}-thumb.webp`,
    width: 768,
    height: 1024,
    ...overrides,
  }
}

/** `n` portrait rows, newest first — `db-0` is the newest. */
function rows(n: number) {
  return Array.from({ length: n }, (_, i) => row(`db-${i}`))
}

const STATIC_SRCS = [
  ...HOME_V4_STRIP.map((shot) => shot.src),
  ...HOME_V4_STRIP_SPARES,
]

/**
 * `getHomeV4ShowcaseShots` is the only thing between the production database and
 * the first screen of the marketing site, and it runs at *build* time. So the
 * two properties pinned hardest here are the ones a rendering test can never
 * see: it always returns a full wall, and it never throws.
 */
describe('getHomeV4ShowcaseShots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    curation.pinned = []
    curation.blocklist = []
  })

  it('renders the newest public work, keyed by id and sourced from the thumbnail', async () => {
    mockGenerationFindMany.mockResolvedValue(rows(MIN_TOTAL))

    const shots = await getHomeV4ShowcaseShots()

    expect(shots).toHaveLength(MIN_TOTAL)
    expect(shots[0]).toEqual({
      id: 'db-0',
      src: 'https://cdn.example/db-0-thumb.webp',
    })
  })

  it('asks the database only for finished, public, thumbnailed images', async () => {
    mockGenerationFindMany.mockResolvedValue(rows(MIN_TOTAL))

    await getHomeV4ShowcaseShots()

    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isPublic: true,
          outputType: 'IMAGE',
          status: 'COMPLETED',
          thumbnailUrl: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: HOME_V4_SHOWCASE.QUERY_LIMIT,
      }),
    )
  })

  it('drops landscape work — a 3:4 cell would crop it to pieces', async () => {
    mockGenerationFindMany.mockResolvedValue([
      row('wide', { width: 1920, height: 1080 }),
      row('square', { width: 1024, height: 1024 }),
      ...rows(4),
    ])

    const shots = await getHomeV4ShowcaseShots()
    const ids = shots.map((shot) => shot.id)

    expect(ids).not.toContain('wide')
    /* Square is not landscape: `height >= width` keeps it. */
    expect(ids).toContain('square')
  })

  it('keeps blocklisted work off the wall', async () => {
    curation.blocklist = ['db-1']
    mockGenerationFindMany.mockResolvedValue(rows(MIN_TOTAL))

    const shots = await getHomeV4ShowcaseShots()

    expect(shots.map((shot) => shot.id)).not.toContain('db-1')
  })

  it('puts pinned work first, in the order the constant lists it', async () => {
    curation.pinned = ['pin-b', 'pin-a']
    mockGenerationFindMany.mockImplementation(
      (args: { where: { id?: unknown } }) =>
        Promise.resolve(
          args.where.id ? [row('pin-a'), row('pin-b')] : rows(MIN_TOTAL),
        ),
    )

    const shots = await getHomeV4ShowcaseShots()

    expect(shots.slice(0, 2).map((shot) => shot.id)).toEqual(['pin-b', 'pin-a'])
  })

  it('lets a pin override the portrait rule but never the public one', async () => {
    curation.pinned = ['pin-wide']
    mockGenerationFindMany.mockImplementation(
      (args: { where: { id?: unknown } }) =>
        Promise.resolve(
          args.where.id
            ? [row('pin-wide', { width: 1920, height: 1080 })]
            : rows(MIN_TOTAL),
        ),
    )

    const shots = await getHomeV4ShowcaseShots()

    expect(shots[0].id).toBe('pin-wide')
    /* The public/completed/thumbnail gate is in the `where`, so a pinned id that
       fails it simply returns no row — it is never bolted on afterwards. */
    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublic: true,
          status: 'COMPLETED',
          id: { in: ['pin-wide'] },
        }),
      }),
    )
  })

  it('lets the blocklist win over a pin', async () => {
    curation.pinned = ['db-1']
    curation.blocklist = ['db-1']
    mockGenerationFindMany.mockResolvedValue(rows(MIN_TOTAL))

    await getHomeV4ShowcaseShots()

    /* Only the latest query runs — the pinned query is skipped entirely. */
    expect(mockGenerationFindMany).toHaveBeenCalledTimes(1)
  })

  it('never queries for pins when the list is empty', async () => {
    mockGenerationFindMany.mockResolvedValue(rows(MIN_TOTAL))

    await getHomeV4ShowcaseShots()

    expect(mockGenerationFindMany).toHaveBeenCalledTimes(1)
  })

  it('pads a thin library with the bundled strip so the wall is always full', async () => {
    mockGenerationFindMany.mockResolvedValue(rows(3))

    const shots = await getHomeV4ShowcaseShots()

    expect(shots.length).toBeGreaterThanOrEqual(MIN_TOTAL)
    expect(shots.slice(0, 3).map((shot) => shot.id)).toEqual([
      'db-0',
      'db-1',
      'db-2',
    ])
    /* Everything after the real work comes from the bundled assets. */
    for (const shot of shots.slice(3)) {
      expect(STATIC_SRCS).toContain(shot.src)
    }
  })

  it('falls back to the bundled strip when the database is unreachable', async () => {
    mockGenerationFindMany.mockRejectedValue(new Error('ECONNREFUSED'))

    const shots = await getHomeV4ShowcaseShots()

    expect(shots.map((shot) => shot.src)).toEqual(STATIC_SRCS)
  })

  it('caps the pool so a busy gallery does not ship an unbounded payload', async () => {
    mockGenerationFindMany.mockResolvedValue(rows(HOME_V4_SHOWCASE.QUERY_LIMIT))

    const shots = await getHomeV4ShowcaseShots()

    expect(shots).toHaveLength(HOME_V4_SHOWCASE.POOL_LIMIT)
  })
})
