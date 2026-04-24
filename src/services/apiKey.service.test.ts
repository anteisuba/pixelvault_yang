import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockDecryptApiKey = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

vi.mock('@/lib/crypto', () => ({
  encryptApiKey: (value: string) => `encrypted:${value}`,
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}))

import { verifyApiKey } from './apiKey.service'

const KEY_RECORD = {
  id: 'key-1',
  userId: 'user-1',
  modelId: 'fal-video-model',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: {
    label: 'fal.ai',
    baseUrl: 'https://queue.fal.run',
  },
  label: 'FAL',
  encryptedKey: 'encrypted-key',
  maskedKey: 'fal_****test',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('apiKey.service verifyApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(KEY_RECORD)
    mockDecryptApiKey.mockReturnValue('plain-fal-key')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats FAL queue root 404 as an available key and logs response timing', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }))

    const result = await verifyApiKey('key-1', 'user-1')

    expect(result).toMatchObject({
      id: 'key-1',
      status: 'available',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://queue.fal.run',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Key plain-fal-key' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'FAL API key verification response received',
      expect.objectContaining({
        status: 404,
        ok: true,
        latencyMs: expect.any(Number),
      }),
    )
  })

  it('logs structured error details when FAL verification fetch throws', async () => {
    const cause = Object.assign(new Error('self signed certificate'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    })
    const fetchError = new TypeError('fetch failed')
    Object.defineProperty(fetchError, 'cause', { value: cause })

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockRejectedValue(fetchError)

    const result = await verifyApiKey('key-1', 'user-1')

    expect(result).toMatchObject({
      id: 'key-1',
      status: 'failed',
      error: 'fetch failed',
    })
    expect(logger.error).toHaveBeenCalledWith(
      'API key verification failed',
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.FAL,
        baseUrl: 'https://queue.fal.run',
        timeoutMs: 10_000,
        errorName: 'TypeError',
        errorMessage: 'fetch failed',
        causeName: 'Error',
        causeMessage: 'self signed certificate',
        causeCode: 'SELF_SIGNED_CERT_IN_CHAIN',
        latencyMs: expect.any(Number),
      }),
    )
  })
})
