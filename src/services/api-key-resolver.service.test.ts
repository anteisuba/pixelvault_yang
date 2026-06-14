import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindUnique = vi.fn()
const mockGetApiKeyValueById = vi.fn()
const mockGetSystemApiKey = vi.fn()
const mockGetSystemCivitaiToken = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    generationJob: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

vi.mock('@/services/apiKey.service', () => ({
  getApiKeyValueById: (...args: unknown[]) => mockGetApiKeyValueById(...args),
}))

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: (...args: unknown[]) => mockGetSystemApiKey(...args),
  getSystemCivitaiToken: (...args: unknown[]) =>
    mockGetSystemCivitaiToken(...args),
}))

import { resolveExecutionApiKey } from './api-key-resolver.service'

// ─── Fixtures ───────────────────────────────────────────────────

const REQUEST = {
  runId: 'job-1',
  apiKeyId: 'key-1',
}

function buildJob(status = 'RUNNING') {
  return {
    id: REQUEST.runId,
    userId: 'user-1',
    status,
    adapterType: 'fal',
  }
}

function expectForbidden(result: Promise<unknown>) {
  return expect(result).rejects.toMatchObject({
    errorCode: 'FORBIDDEN',
    httpStatus: 403,
  })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('api-key-resolver.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the decrypted API key when job and ownership checks pass', async () => {
    mockFindUnique.mockResolvedValue(buildJob())
    mockGetApiKeyValueById.mockResolvedValue({ keyValue: 'plain-key' })

    const result = await resolveExecutionApiKey(REQUEST)

    expect(result).toEqual({ apiKey: 'plain-key' })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: REQUEST.runId },
      select: { id: true, userId: true, status: true, adapterType: true },
    })
    expect(mockGetApiKeyValueById).toHaveBeenCalledWith(
      REQUEST.apiKeyId,
      'user-1',
    )
  })

  it('returns 403 when runId does not match a generationJob', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expectForbidden(resolveExecutionApiKey(REQUEST))
    expect(mockGetApiKeyValueById).not.toHaveBeenCalled()
  })

  it('returns 403 when the API key does not belong to the job user', async () => {
    mockFindUnique.mockResolvedValue(buildJob())
    mockGetApiKeyValueById.mockResolvedValue(null)

    await expectForbidden(resolveExecutionApiKey(REQUEST))
  })

  it('returns 403 when the API key is inactive or revoked', async () => {
    mockFindUnique.mockResolvedValue(buildJob())
    mockGetApiKeyValueById.mockResolvedValue(null)

    await expectForbidden(resolveExecutionApiKey(REQUEST))
  })

  it('returns 403 when the generationJob is COMPLETED', async () => {
    mockFindUnique.mockResolvedValue(buildJob('COMPLETED'))

    await expectForbidden(resolveExecutionApiKey(REQUEST))
    expect(mockGetApiKeyValueById).not.toHaveBeenCalled()
  })

  it('returns 403 when the generationJob is FAILED', async () => {
    mockFindUnique.mockResolvedValue(buildJob('FAILED'))

    await expectForbidden(resolveExecutionApiKey(REQUEST))
    expect(mockGetApiKeyValueById).not.toHaveBeenCalled()
  })

  it('returns the system API key for signed worker system-key requests', async () => {
    mockFindUnique.mockResolvedValue(buildJob())
    mockGetSystemApiKey.mockReturnValue('system-fal-key')

    const result = await resolveExecutionApiKey({
      runId: 'job-1',
      adapterType: AI_ADAPTER_TYPES.FAL,
      useSystemKey: true,
    })

    expect(result).toEqual({ apiKey: 'system-fal-key' })
    expect(mockGetApiKeyValueById).not.toHaveBeenCalled()
    expect(mockGetSystemApiKey).toHaveBeenCalledWith('fal')
  })

  it('returns 403 for system-key requests whose adapter does not match the job', async () => {
    mockFindUnique.mockResolvedValue(buildJob())

    await expectForbidden(
      resolveExecutionApiKey({
        runId: 'job-1',
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        useSystemKey: true,
      }),
    )
    expect(mockGetSystemApiKey).not.toHaveBeenCalled()
  })

  it('returns the system Civitai token for running Replicate jobs', async () => {
    mockFindUnique.mockResolvedValue({
      ...buildJob(),
      adapterType: AI_ADAPTER_TYPES.REPLICATE,
    })
    mockGetSystemCivitaiToken.mockReturnValue('system-civitai-token')

    const result = await resolveExecutionApiKey({
      runId: 'job-1',
      keyKind: 'civitai',
    })

    expect(result).toEqual({ apiKey: 'system-civitai-token' })
    expect(mockGetSystemCivitaiToken).toHaveBeenCalled()
    expect(mockGetApiKeyValueById).not.toHaveBeenCalled()
  })

  it('returns 403 when the system Civitai token is missing', async () => {
    mockFindUnique.mockResolvedValue({
      ...buildJob(),
      adapterType: AI_ADAPTER_TYPES.FAL,
    })
    mockGetSystemCivitaiToken.mockReturnValue(null)

    await expectForbidden(
      resolveExecutionApiKey({
        runId: 'job-1',
        keyKind: 'civitai',
      }),
    )
  })

  it('returns 403 for Civitai token requests on unsupported adapters', async () => {
    mockFindUnique.mockResolvedValue({
      ...buildJob(),
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })

    await expectForbidden(
      resolveExecutionApiKey({
        runId: 'job-1',
        keyKind: 'civitai',
      }),
    )
    expect(mockGetSystemCivitaiToken).not.toHaveBeenCalled()
  })
})
