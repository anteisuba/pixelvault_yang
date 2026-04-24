import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindUnique = vi.fn()
const mockGetApiKeyValueById = vi.fn()

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
      select: { id: true, userId: true, status: true },
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
})
