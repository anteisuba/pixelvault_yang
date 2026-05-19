import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockAssetFindUnique = vi.fn()
const mockAssetFindMany = vi.fn()
const mockAssetCreate = vi.fn()
const mockAssetUpdate = vi.fn()
const mockJobFindUnique = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    loraAsset: {
      findUnique: (...a: unknown[]) => mockAssetFindUnique(...a),
      findMany: (...a: unknown[]) => mockAssetFindMany(...a),
      create: (...a: unknown[]) => mockAssetCreate(...a),
      update: (...a: unknown[]) => mockAssetUpdate(...a),
    },
    loraTrainingJob: {
      findUnique: (...a: unknown[]) => mockJobFindUnique(...a),
    },
  },
}))

import {
  generateStyleCode,
  getLoraAssetByStyleCode,
  listLoraAssetsForUser,
  ensureLoraAssetFromTrainingJob,
  findLoraAssetsByUrls,
  listDiscoverLoraAssets,
  setLoraAssetVisibility,
} from '@/services/lora-asset.service'

const OWNER = { id: 'user_owner', clerkId: 'clerk_owner' }
const VIEWER = { id: 'user_viewer', clerkId: 'clerk_viewer' }

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'asset_1',
    userId: OWNER.id,
    styleCode: 'pv-c-forest-ab12',
    name: 'Forest',
    source: 'trained',
    type: 'subject',
    baseModelFamily: 'flux',
    provider: 'fal',
    triggerWord: 'pv_forest',
    loraUrl: 'https://r2.example.com/forest.safetensors',
    coverImageUrl: null,
    previewImageUrls: null,
    defaultScale: 1.0,
    isPublic: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateStyleCode', () => {
  it('produces URL-safe codes with kind prefix and random suffix', () => {
    // The slug is truncated to 24 chars, so "studio-ghibli-soft-pastels" loses "ls"
    const code = generateStyleCode('Studio Ghibli soft pastels', 'style')
    expect(code).toMatch(/^pv-s-studio-ghibli-soft-paste-[a-f0-9]{4}$/)
  })

  it('falls back to "lora" when the name has no slug-able characters', () => {
    const code = generateStyleCode('!!!', 'subject')
    expect(code).toMatch(/^pv-c-lora-[a-f0-9]{4}$/)
  })

  it('different invocations yield different suffixes', () => {
    const a = generateStyleCode('x', 'subject')
    const b = generateStyleCode('x', 'subject')
    expect(a).not.toBe(b)
  })
})

describe('getLoraAssetByStyleCode', () => {
  it('returns null when the code does not exist', async () => {
    mockAssetFindUnique.mockResolvedValue(null)
    const result = await getLoraAssetByStyleCode('missing', null)
    expect(result).toBeNull()
  })

  it('returns curated/public assets to anonymous viewers', async () => {
    mockAssetFindUnique.mockResolvedValue(
      buildRow({ source: 'curated', userId: null, isPublic: true }),
    )
    const result = await getLoraAssetByStyleCode('pv-s-foo-aaaa', null)
    expect(result).not.toBeNull()
    expect(result?.isOwn).toBe(false)
    expect(result?.isPublic).toBe(true)
  })

  it('returns private assets to their owner', async () => {
    mockAssetFindUnique.mockResolvedValue(buildRow({ isPublic: false }))
    mockEnsureUser.mockResolvedValue(OWNER)
    const result = await getLoraAssetByStyleCode('pv-c-x-aaaa', OWNER.clerkId)
    expect(result).not.toBeNull()
    expect(result?.isOwn).toBe(true)
  })

  it('hides private assets from non-owners (no enumeration leak)', async () => {
    mockAssetFindUnique.mockResolvedValue(buildRow({ isPublic: false }))
    mockEnsureUser.mockResolvedValue(VIEWER)
    const result = await getLoraAssetByStyleCode('pv-c-x-aaaa', VIEWER.clerkId)
    expect(result).toBeNull()
  })
})

describe('listLoraAssetsForUser', () => {
  it('returns owned assets first, then curated', async () => {
    mockEnsureUser.mockResolvedValue(OWNER)
    mockAssetFindMany
      .mockResolvedValueOnce([
        buildRow({ id: 'owned_1', name: 'Mine A' }),
        buildRow({ id: 'owned_2', name: 'Mine B' }),
      ])
      .mockResolvedValueOnce([
        buildRow({
          id: 'curated_1',
          userId: null,
          source: 'curated',
          isPublic: true,
          name: 'Studio',
        }),
      ])

    const result = await listLoraAssetsForUser(OWNER.clerkId)

    expect(result.map((r) => r.id)).toEqual(['owned_1', 'owned_2', 'curated_1'])
    expect(result[0]?.isOwn).toBe(true)
    expect(result[2]?.isOwn).toBe(false)
  })
})

describe('findLoraAssetsByUrls', () => {
  it('returns empty when no URLs provided', async () => {
    const result = await findLoraAssetsByUrls([], null)
    expect(result).toEqual([])
    expect(mockAssetFindMany).not.toHaveBeenCalled()
  })

  it('preserves the input URL order in the output', async () => {
    const urls = ['https://x/a.safetensors', 'https://x/b.safetensors']
    mockAssetFindMany.mockResolvedValue([
      buildRow({ id: 'b1', loraUrl: urls[1], isPublic: true }),
      buildRow({ id: 'a1', loraUrl: urls[0], isPublic: true }),
    ])
    const result = await findLoraAssetsByUrls(urls, null)
    expect(result.map((r) => r.id)).toEqual(['a1', 'b1'])
  })

  it("prefers the viewer's own copy over a public copy on URL collision", async () => {
    const url = 'https://x/shared.safetensors'
    mockAssetFindMany.mockResolvedValue([
      buildRow({
        id: 'public_copy',
        userId: null,
        loraUrl: url,
        isPublic: true,
      }),
      buildRow({
        id: 'owned_copy',
        userId: OWNER.id,
        loraUrl: url,
        isPublic: false,
      }),
    ])
    const result = await findLoraAssetsByUrls([url], OWNER.id)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('owned_copy')
  })

  it('skips URLs the viewer cannot see', async () => {
    const url = 'https://x/private.safetensors'
    mockAssetFindMany.mockResolvedValue([
      buildRow({
        id: 'private',
        userId: OWNER.id,
        loraUrl: url,
        isPublic: false,
      }),
    ])
    const result = await findLoraAssetsByUrls([url], VIEWER.id)
    expect(result).toEqual([])
  })
})

describe('ensureLoraAssetFromTrainingJob', () => {
  it('no-ops when the job is not completed', async () => {
    mockJobFindUnique.mockResolvedValue({
      id: 'job_1',
      status: 'TRAINING',
      loraUrl: null,
      loraAsset: null,
    })
    await ensureLoraAssetFromTrainingJob('job_1')
    expect(mockAssetCreate).not.toHaveBeenCalled()
  })

  it('no-ops when an asset already exists for the job', async () => {
    mockJobFindUnique.mockResolvedValue({
      id: 'job_1',
      status: 'COMPLETED',
      loraUrl: 'https://r2.example.com/x.safetensors',
      loraAsset: { id: 'asset_existing' },
    })
    await ensureLoraAssetFromTrainingJob('job_1')
    expect(mockAssetCreate).not.toHaveBeenCalled()
  })

  it('creates an asset for a completed job that has none', async () => {
    mockJobFindUnique.mockResolvedValue({
      id: 'job_1',
      userId: OWNER.id,
      name: 'Forest',
      triggerWord: 'pv_forest',
      loraType: 'subject',
      baseModel: 'flux-dev-fal',
      status: 'COMPLETED',
      loraUrl: 'https://r2.example.com/x.safetensors',
      loraStorageKey: 'lora-weights/owner/job_1.safetensors',
      loraAsset: null,
    })
    mockAssetFindUnique.mockResolvedValue(null) // styleCode is unique on first try
    mockAssetCreate.mockResolvedValue({ id: 'asset_new' })

    await ensureLoraAssetFromTrainingJob('job_1')

    expect(mockAssetCreate).toHaveBeenCalledTimes(1)
    const callArg = mockAssetCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(callArg.data).toMatchObject({
      userId: OWNER.id,
      name: 'Forest',
      source: 'trained',
      type: 'subject',
      provider: 'fal',
      triggerWord: 'pv_forest',
      loraUrl: 'https://r2.example.com/x.safetensors',
      trainingJobId: 'job_1',
    })
    expect(callArg.data.styleCode).toMatch(/^pv-c-forest-[a-f0-9]{4}$/)
  })
})

describe('listDiscoverLoraAssets', () => {
  it('excludes the viewer own assets when signed in', async () => {
    mockEnsureUser.mockResolvedValue(OWNER)
    mockAssetFindMany.mockResolvedValue([
      buildRow({ id: 'other_1', userId: 'stranger', isPublic: true }),
    ])
    const result = await listDiscoverLoraAssets(OWNER.clerkId)
    const where = mockAssetFindMany.mock.calls[0][0].where as {
      userId?: { not: string }
    }
    expect(where.userId).toEqual({ not: OWNER.id })
    expect(result).toHaveLength(1)
  })

  it('drops the user filter for anonymous viewers', async () => {
    mockAssetFindMany.mockResolvedValue([])
    await listDiscoverLoraAssets(null)
    const where = mockAssetFindMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >
    expect(where.userId).toBeUndefined()
    expect(where.isPublic).toBe(true)
    expect(where.source).toBe('trained')
  })
})

describe('setLoraAssetVisibility', () => {
  it('returns null when the asset does not exist', async () => {
    mockEnsureUser.mockResolvedValue(OWNER)
    mockAssetFindUnique.mockResolvedValue(null)
    const result = await setLoraAssetVisibility(OWNER.clerkId, 'missing', true)
    expect(result).toBeNull()
    expect(mockAssetUpdate).not.toHaveBeenCalled()
  })

  it('throws when caller is not the owner', async () => {
    mockEnsureUser.mockResolvedValue(VIEWER)
    mockAssetFindUnique.mockResolvedValue(buildRow({ userId: OWNER.id }))
    await expect(
      setLoraAssetVisibility(VIEWER.clerkId, 'asset_1', true),
    ).rejects.toThrow(/authorized/i)
    expect(mockAssetUpdate).not.toHaveBeenCalled()
  })

  it('flips isPublic and returns the updated record for the owner', async () => {
    mockEnsureUser.mockResolvedValue(OWNER)
    mockAssetFindUnique.mockResolvedValue(buildRow({ isPublic: false }))
    mockAssetUpdate.mockResolvedValue(buildRow({ isPublic: true }))
    const result = await setLoraAssetVisibility(OWNER.clerkId, 'asset_1', true)
    expect(mockAssetUpdate).toHaveBeenCalledWith({
      where: { id: 'asset_1' },
      data: { isPublic: true },
    })
    expect(result?.isPublic).toBe(true)
    expect(result?.isOwn).toBe(true)
  })
})
