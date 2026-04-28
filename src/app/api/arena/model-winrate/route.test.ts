import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/arena.service', () => ({
  getModelWinRatesByTask: vi.fn(),
}))

import { getModelWinRatesByTask } from '@/services/arena.service'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/arena/model-winrate', () => {
  it('returns model win rates without requiring auth', async () => {
    mockUnauthenticated()
    vi.mocked(getModelWinRatesByTask).mockResolvedValue({
      sdxl: 0.67,
      'seedream-3.0': 0.5,
    })

    const res = await GET(
      createGET('/api/arena/model-winrate', { taskType: 'portrait' }),
    )
    const body = await parseJSON(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        sdxl: 0.67,
        'seedream-3.0': 0.5,
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
