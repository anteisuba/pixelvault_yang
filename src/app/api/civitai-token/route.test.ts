import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPUT,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/civitai-token.service', () => ({
  setCivitaiToken: vi.fn(),
  hasCivitaiToken: vi.fn(),
  deleteCivitaiToken: vi.fn(),
}))

import { GET, PUT, DELETE } from './route'
import {
  setCivitaiToken,
  hasCivitaiToken,
  deleteCivitaiToken,
} from '@/services/civitai-token.service'

const mockSetCivitaiToken = vi.mocked(setCivitaiToken)
const mockHasCivitaiToken = vi.mocked(hasCivitaiToken)
const mockDeleteCivitaiToken = vi.mocked(deleteCivitaiToken)

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockHasCivitaiToken.mockResolvedValue(true)
  mockSetCivitaiToken.mockResolvedValue(undefined)
  mockDeleteCivitaiToken.mockResolvedValue(undefined)
})

describe('GET /api/civitai-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/civitai-token'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockHasCivitaiToken).not.toHaveBeenCalled()
  })

  it('returns token status for the authenticated user', async () => {
    const res = await GET(createGET('/api/civitai-token'))
    const body = await parseJSON<{
      success: boolean
      data: { hasToken: boolean }
    }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { hasToken: true } })
    expect(mockHasCivitaiToken).toHaveBeenCalledWith('clerk_test_user')
  })
})

describe('PUT /api/civitai-token', () => {
  it('returns 400 for invalid token body', async () => {
    const res = await PUT(createPUT('/api/civitai-token', { token: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockSetCivitaiToken).not.toHaveBeenCalled()
  })

  it('sets the Civitai token for the authenticated user', async () => {
    const res = await PUT(
      createPUT('/api/civitai-token', { token: 'civitai-token' }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: {} })
    expect(mockSetCivitaiToken).toHaveBeenCalledWith(
      'clerk_test_user',
      'civitai-token',
    )
  })
})

describe('DELETE /api/civitai-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await DELETE()
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('deletes the Civitai token for the authenticated user', async () => {
    const res = await DELETE()
    const body = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockDeleteCivitaiToken).toHaveBeenCalledWith('clerk_test_user')
  })
})
