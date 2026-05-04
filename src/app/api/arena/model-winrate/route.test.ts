import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena-winrate.service', () => ({
  getModelWinRatesByTask: vi.fn(),
}))

import { getModelWinRatesByTask } from '@/services/arena-winrate.service'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
})

describe('GET /api/arena/model-winrate', () => {
  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const res = await GET(
      createGET('/api/arena/model-winrate', { taskType: 'portrait' }),
    )

    expect(res.status).toBe(401)
    expect(getModelWinRatesByTask).not.toHaveBeenCalled()
  })

  it('returns model win rates for authenticated users', async () => {
    vi.mocked(getModelWinRatesByTask).mockResolvedValue(
      new Map([
        ['sdxl', 0.67],
        ['seedream-3.0', 0.5],
      ]),
    )

    const res = await GET(
      createGET('/api/arena/model-winrate', { taskType: 'portrait' }),
    )
    const body = await parseJSON(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        winRates: {
          sdxl: 0.67,
          'seedream-3.0': 0.5,
        },
      },
    })
    expect(getModelWinRatesByTask).toHaveBeenCalledWith('portrait')
  })

  it('returns 400 when taskType is missing', async () => {
    const res = await GET(createGET('/api/arena/model-winrate'))
    const body = await parseJSON(res)

    expect(res.status).toBe(400)
    expect(body).toMatchObject({ success: false, errorCode: 'INVALID_QUERY' })
    expect(getModelWinRatesByTask).not.toHaveBeenCalled()
  })

  it('returns 400 when taskType is invalid', async () => {
    const res = await GET(
      createGET('/api/arena/model-winrate', { taskType: 'unsupported' }),
    )
    const body = await parseJSON(res)

    expect(res.status).toBe(400)
    expect(body).toMatchObject({ success: false, errorCode: 'INVALID_QUERY' })
    expect(getModelWinRatesByTask).not.toHaveBeenCalled()
  })
})
