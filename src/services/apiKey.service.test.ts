import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockUpsert = vi.hoisted(() => vi.fn())
const mockDecryptApiKey = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}))

vi.mock('@/lib/crypto', () => ({
  encryptApiKey: (value: string) => `encrypted:${value}`,
  decryptApiKey: (...args: unknown[]) => mockDecryptApiKey(...args),
}))

import { createApiKey, verifyApiKey } from './apiKey.service'

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

const FISH_PROVIDER_CONFIG = {
  label: 'Fish Audio',
  baseUrl: 'https://api.fish.audio',
}

const FISH_KEY_RECORD = {
  id: 'key-2',
  userId: 'user-1',
  modelId: 'fish-audio-s2-pro',
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
  providerConfig: FISH_PROVIDER_CONFIG,
  label: 'Fish Audio',
  encryptedKey: 'encrypted:fish-api-key-1234',
  maskedKey: 'fish****...****1234',
  isActive: true,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
}

const RUNWAY_KEY_RECORD = {
  id: 'key-3',
  userId: 'user-1',
  modelId: 'runway-gen4.5',
  adapterType: AI_ADAPTER_TYPES.RUNWAY,
  providerConfig: {
    label: 'Runway',
    baseUrl: 'https://api.dev.runwayml.com/v1',
  },
  label: 'Runway',
  encryptedKey: 'encrypted:runway-key',
  maskedKey: 'key_****test',
  isActive: true,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
}

describe('apiKey.service createApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue(FISH_KEY_RECORD)
  })

  it('updates the existing model key instead of failing on duplicate saves', async () => {
    const result = await createApiKey(
      'user-1',
      'fish-audio-s2-pro',
      AI_ADAPTER_TYPES.FISH_AUDIO,
      FISH_PROVIDER_CONFIG,
      'Fish Audio',
      'fish-api-key-1234',
    )

    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        userId_adapterType_modelId: {
          userId: 'user-1',
          adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
          modelId: 'fish-audio-s2-pro',
        },
      },
      create: {
        userId: 'user-1',
        modelId: 'fish-audio-s2-pro',
        adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
        providerConfig: FISH_PROVIDER_CONFIG,
        label: 'Fish Audio',
        encryptedKey: 'encrypted:fish-api-key-1234',
        maskedKey: 'fish****...****1234',
        isActive: true,
      },
      update: {
        providerConfig: FISH_PROVIDER_CONFIG,
        label: 'Fish Audio',
        encryptedKey: 'encrypted:fish-api-key-1234',
        maskedKey: 'fish****...****1234',
        isActive: true,
      },
    })
    expect(result).toEqual({
      id: 'key-2',
      modelId: 'fish-audio-s2-pro',
      adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
      providerConfig: FISH_PROVIDER_CONFIG,
      label: 'Fish Audio',
      maskedKey: 'fish****...****1234',
      isActive: true,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    })
  })
})

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

  it('verifies Runway keys against the task endpoint with the current API version', async () => {
    mockFindUnique.mockResolvedValue(RUNWAY_KEY_RECORD)
    mockDecryptApiKey.mockReturnValue('plain-runway-key')
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'The task does not exist' }), {
        status: 404,
      }),
    )

    const result = await verifyApiKey('key-3', 'user-1')

    expect(result).toMatchObject({
      id: 'key-3',
      status: 'available',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/tasks/00000000-0000-4000-8000-000000000000',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer plain-runway-key',
          'X-Runway-Version': '2024-11-06',
        },
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
