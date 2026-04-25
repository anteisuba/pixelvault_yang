/**
 * WP-Usage-02 · FreeTier concurrent boundary tests
 *
 * Tests:
 *   1. Free-tier route reserves a daily slot before returning platform key
 *   2. Boundary: available slot allows, exhausted slot rejects
 *   3. Concurrent: 25 parallel resolveGenerationRoute → exactly 20 pass
 *   4. BYOK bypasses free-tier slot reservation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
  getApiKeyValueById: vi.fn(),
}))
vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
}))
vi.mock('@/services/providers/registry', () => ({
  getProviderAdapter: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
  generateStorageKey: vi.fn(),
  uploadToR2: vi.fn(),
}))
vi.mock('@/services/usage.service', () => ({
  atomicReserveFreeTierSlot: vi.fn(),
  createApiUsageEntry: vi.fn(),
  createGenerationJob: vi.fn(),
  completeGenerationJob: vi.fn(),
  failGenerationJob: vi.fn(),
  attachUsageEntryToGeneration: vi.fn(),
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/with-retry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}))
vi.mock('@/lib/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn(() => ({
    call: (fn: () => Promise<unknown>) => fn(),
  })),
}))
vi.mock('@/lib/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
}))

// Mock models — getModelById returns free-tier-eligible model
const { modelsMock } = vi.hoisted(() => ({
  modelsMock: {
    realGetModelById: undefined as ((id: string) => unknown) | undefined,
  },
}))
vi.mock('@/constants/models', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  modelsMock.realGetModelById = actual.getModelById as (id: string) => unknown
  return {
    ...actual,
    getModelById: vi.fn((id: string) => {
      const model = modelsMock.realGetModelById?.(id)
      if (!model) return undefined
      // Make gemini model free-tier for testing
      return { ...(model as object), freeTier: true } as never
    }),
  }
})

import { resolveGenerationRoute } from '@/services/generate-image.service'
import { atomicReserveFreeTierSlot } from '@/services/usage.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getSystemApiKey } from '@/lib/platform-keys'

const mockReserve = vi.mocked(atomicReserveFreeTierSlot)
const mockFindKey = vi.mocked(findActiveKeyForAdapter)
const mockGetPlatformKey = vi.mocked(getSystemApiKey)

// ─── Setup ──────────────────────────────────────────────────────

const FREE_TIER_MODEL = 'gemini-3.1-flash-image-preview'

function freeLimitError(message = 'Free tier limit reached (20/day).') {
  return Object.assign(new Error(message), {
    code: 'FREE_LIMIT_EXCEEDED' as const,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindKey.mockResolvedValue(null) // No user key → free tier path
  mockReserve.mockResolvedValue(undefined)
  mockGetPlatformKey.mockReturnValue('platform-test-key')
})

// ─── Tests ──────────────────────────────────────────────────────

describe('FreeTier boundary', () => {
  it('allows generation when a free-tier slot is reserved', async () => {
    const route = await resolveGenerationRoute('user-1', {
      modelId: FREE_TIER_MODEL,
    })

    expect(route.isFreeGeneration).toBe(true)
    expect(route.apiKey).toBe('platform-test-key')
    expect(mockReserve).toHaveBeenCalledWith('user-1')
  })

  it('rejects generation when the daily slot limit is reached', async () => {
    mockReserve.mockRejectedValue(freeLimitError())

    await expect(
      resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FREE_LIMIT_EXCEEDED' }))
  })

  it('rejects when the daily slot limit is exceeded', async () => {
    mockReserve.mockRejectedValue(freeLimitError())

    await expect(
      resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FREE_LIMIT_EXCEEDED' }))
  })
})

describe('FreeTier concurrent requests (atomic reservation)', () => {
  it('20 parallel requests with limit 20 — exactly 20 pass, 0 over-run', async () => {
    let reservedCount = 0

    mockReserve.mockImplementation(async () => {
      if (reservedCount >= 20) {
        throw freeLimitError()
      }
      reservedCount++
    })

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
      ),
    )

    const passed = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    expect(passed).toBe(20)
    expect(rejected).toBe(0)
    expect(reservedCount).toBe(20)
  })

  it('25 parallel requests with limit 20 — exactly 20 pass, 5 rejected', async () => {
    let reservedCount = 0

    mockReserve.mockImplementation(async () => {
      if (reservedCount >= 20) {
        throw freeLimitError()
      }
      reservedCount++
    })

    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        resolveGenerationRoute('user-1', { modelId: FREE_TIER_MODEL }),
      ),
    )

    const passed = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    expect(passed).toBe(20)
    expect(rejected).toBe(5)
  })
})

describe('FreeTier reservation boundary', () => {
  it('atomicReserveFreeTierSlot is called with current user ID', async () => {
    await resolveGenerationRoute('user-abc', { modelId: FREE_TIER_MODEL })

    expect(mockReserve).toHaveBeenCalledWith('user-abc')
  })

  it('bypasses free tier when user has own API key', async () => {
    mockFindKey.mockResolvedValue({
      keyValue: 'user-own-key',
      providerConfig: { label: 'Gemini', baseUrl: 'https://api.gemini' },
    } as never)

    const route = await resolveGenerationRoute('user-1', {
      modelId: FREE_TIER_MODEL,
    })

    expect(route.apiKey).toBe('user-own-key')
    expect(route.isFreeGeneration).toBeUndefined()
    expect(mockReserve).not.toHaveBeenCalled()
  })
})
