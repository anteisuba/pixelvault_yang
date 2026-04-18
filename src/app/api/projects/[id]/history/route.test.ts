import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/project.service', () => ({
  getProjectHistory: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GET } from '@/app/api/projects/[id]/history/route'
import { getProjectHistory } from '@/services/project.service'

const mockGetProjectHistory = vi.mocked(getProjectHistory)

const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

describe('GET /api/projects/[id]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGetProjectHistory.mockResolvedValue({
      generations: [],
      total: 0,
      hasMore: false,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(
      createGET('/api/projects/unassigned/history'),
      routeParams('unassigned'),
    )

    expect(res.status).toBe(401)
  })

  it('returns history for the unassigned pseudo-project', async () => {
    const res = await GET(
      createGET('/api/projects/unassigned/history', {
        limit: '10',
        type: 'image',
      }),
      routeParams('unassigned'),
    )
    const json = await parseJSON<{
      success: boolean
      data: { generations: unknown[]; total: number; hasMore: boolean }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockGetProjectHistory).toHaveBeenCalledWith(
      'clerk_test_user',
      null,
      undefined,
      10,
      'IMAGE',
    )
  })

  it('returns 503 when the database transfer quota is exceeded', async () => {
    mockGetProjectHistory.mockRejectedValue(
      new Error(
        'Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.',
      ),
    )

    const res = await GET(
      createGET('/api/projects/unassigned/history'),
      routeParams('unassigned'),
    )
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(503)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Database service is temporarily unavailable')
  })
})
