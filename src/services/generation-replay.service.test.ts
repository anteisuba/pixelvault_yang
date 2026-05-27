import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockFindLoraAssetsByUrls = vi.fn()
vi.mock('@/services/lora-asset.service', () => ({
  findLoraAssetsByUrls: (...a: unknown[]) => mockFindLoraAssetsByUrls(...a),
}))

const mockFindUnique = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
    },
  },
}))

import { getReplayPayload } from '@/services/generation-replay.service'

const OWNER = { id: 'user_owner', clerkId: 'clerk_owner' }
const STRANGER = { id: 'user_stranger', clerkId: 'clerk_stranger' }

const URL_A = 'https://r2.example.com/a.safetensors'
const URL_B = 'https://r2.example.com/b.safetensors'

function buildGeneration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gen_1',
    userId: OWNER.id,
    isPublic: true,
    snapshot: {
      advancedParams: { loras: [{ url: URL_A, scale: 0.9 }] },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getReplayPayload', () => {
  it('returns null when the generation does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await getReplayPayload('missing', null)
    expect(result).toBeNull()
  })

  it('returns null when the generation is private and viewer is anonymous', async () => {
    mockFindUnique.mockResolvedValue(buildGeneration({ isPublic: false }))
    const result = await getReplayPayload('gen_1', null)
    expect(result).toBeNull()
  })

  it('returns null when the generation is private and viewer is not owner', async () => {
    mockFindUnique.mockResolvedValue(buildGeneration({ isPublic: false }))
    mockEnsureUser.mockResolvedValue(STRANGER)
    const result = await getReplayPayload('gen_1', STRANGER.clerkId)
    expect(result).toBeNull()
  })

  it('returns the owner private generation to the owner', async () => {
    mockFindUnique.mockResolvedValue(buildGeneration({ isPublic: false }))
    mockEnsureUser.mockResolvedValue(OWNER)
    mockFindLoraAssetsByUrls.mockResolvedValue([{ styleCode: 'pv-c-x-aaaa' }])
    const result = await getReplayPayload('gen_1', OWNER.clerkId)
    expect(result).not.toBeNull()
    expect(result?.styleCodes).toEqual(['pv-c-x-aaaa'])
  })

  it('returns empty styleCodes when the snapshot has no loras', async () => {
    mockFindUnique.mockResolvedValue(buildGeneration({ snapshot: {} }))
    const result = await getReplayPayload('gen_1', null)
    expect(result).toEqual({
      generationId: 'gen_1',
      styleCodes: [],
      hasHiddenLoras: false,
      prompt: null,
      seed: null,
      negativePrompt: null,
      aspectRatio: null,
    })
    expect(mockFindLoraAssetsByUrls).not.toHaveBeenCalled()
  })

  it('extracts prompt + seed + negative + aspect ratio from a full snapshot', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({
        snapshot: {
          freePrompt: 'denia, c1, white dress',
          compiledPrompt: 'denia, c1, white dress, masterpiece',
          seed: 12345,
          aspectRatio: '9:16',
          advancedParams: {
            loras: [{ url: URL_A, scale: 0.9 }],
            seed: 12345,
            negativePrompt: 'worst quality, lowres',
          },
        },
      }),
    )
    mockFindLoraAssetsByUrls.mockResolvedValue([{ styleCode: 'pv-c-x-aaaa' }])
    const result = await getReplayPayload('gen_1', null)
    // Prefers freePrompt over compiledPrompt — what the user typed is
    // what they want to keep editing.
    expect(result?.prompt).toBe('denia, c1, white dress')
    expect(result?.seed).toBe(12345)
    expect(result?.negativePrompt).toBe('worst quality, lowres')
    expect(result?.aspectRatio).toBe('9:16')
  })

  it('treats seed=-1 (random) as null so the client lets the provider re-pick', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({
        snapshot: {
          freePrompt: 'a prompt',
          seed: -1,
          advancedParams: { loras: [{ url: URL_A, scale: 0.9 }] },
        },
      }),
    )
    mockFindLoraAssetsByUrls.mockResolvedValue([{ styleCode: 'x' }])
    const result = await getReplayPayload('gen_1', null)
    expect(result?.seed).toBeNull()
  })

  it('falls back to compiledPrompt when freePrompt is missing (older snapshots)', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({
        snapshot: {
          compiledPrompt: 'only-the-compiled-one',
          advancedParams: { loras: [] },
        },
      }),
    )
    const result = await getReplayPayload('gen_1', null)
    expect(result?.prompt).toBe('only-the-compiled-one')
  })

  it('rejects an unknown aspectRatio value rather than passing it through', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({
        snapshot: {
          aspectRatio: '21:9', // not in the allowed set
          advancedParams: { loras: [] },
        },
      }),
    )
    const result = await getReplayPayload('gen_1', null)
    expect(result?.aspectRatio).toBeNull()
  })

  it('flags hasHiddenLoras when some URLs do not resolve to visible assets', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({
        snapshot: {
          advancedParams: {
            loras: [
              { url: URL_A, scale: 0.9 },
              { url: URL_B, scale: 1.0 }, // viewer can't see this one
            ],
          },
        },
      }),
    )
    mockFindLoraAssetsByUrls.mockResolvedValue([
      { styleCode: 'pv-c-only-a-aaaa' },
    ])
    const result = await getReplayPayload('gen_1', null)
    expect(result?.styleCodes).toEqual(['pv-c-only-a-aaaa'])
    expect(result?.hasHiddenLoras).toBe(true)
  })

  it('tolerates malformed snapshot shapes (returns empty codes)', async () => {
    mockFindUnique.mockResolvedValue(
      buildGeneration({ snapshot: { advancedParams: 'not-an-object' } }),
    )
    const result = await getReplayPayload('gen_1', null)
    expect(result?.styleCodes).toEqual([])
    expect(result?.hasHiddenLoras).toBe(false)
  })
})
