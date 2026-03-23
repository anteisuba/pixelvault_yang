import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('@/services/user.service', () => ({
  getUserByClerkId: vi.fn(),
}))

vi.mock('@/services/usage.service', () => ({
  getUserUsageSummary: vi.fn(),
}))

import { getUserByClerkId } from '@/services/user.service'
import { getUserUsageSummary } from '@/services/usage.service'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/usage-summary', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET()

    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns usage summary on success', async () => {
    mockAuthenticated()
    vi.mocked(getUserByClerkId).mockResolvedValue(FAKE_DB_USER)

    const lastReqDate = new Date('2026-03-20T10:00:00Z')
    const usageData = {
      totalRequests: 50,
      successfulRequests: 45,
      failedRequests: 5,
      last30DaysRequests: 30,
      lastRequestAt: lastReqDate,
    }
    vi.mocked(getUserUsageSummary).mockResolvedValue(usageData)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      totalRequests: 50,
      successfulRequests: 45,
      failedRequests: 5,
      last30DaysRequests: 30,
      lastRequestAt: lastReqDate.toISOString(),
    })
    expect(getUserByClerkId).toHaveBeenCalledWith('clerk_test_user')
    expect(getUserUsageSummary).toHaveBeenCalledWith(FAKE_DB_USER.id)
  })

  it('returns zero stats when user not found in DB', async () => {
    mockAuthenticated()
    vi.mocked(getUserByClerkId).mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      last30DaysRequests: 0,
      lastRequestAt: null,
    })
    expect(getUserUsageSummary).not.toHaveBeenCalled()
  })

  it('returns zero stats when usage summary is null', async () => {
    mockAuthenticated()
    vi.mocked(getUserByClerkId).mockResolvedValue(FAKE_DB_USER)
    vi.mocked(getUserUsageSummary).mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      last30DaysRequests: 0,
      lastRequestAt: null,
    })
  })

  it('returns summary with null lastRequestAt', async () => {
    mockAuthenticated()
    vi.mocked(getUserByClerkId).mockResolvedValue(FAKE_DB_USER)
    vi.mocked(getUserUsageSummary).mockResolvedValue({
      totalRequests: 10,
      successfulRequests: 10,
      failedRequests: 0,
      last30DaysRequests: 5,
      lastRequestAt: null,
    })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      totalRequests: 10,
      successfulRequests: 10,
      failedRequests: 0,
      last30DaysRequests: 5,
      lastRequestAt: null,
    })
  })
})
