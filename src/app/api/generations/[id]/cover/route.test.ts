import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPATCH,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock('@/services/generation.service', () => ({
  setAudioCoverImage: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

import { PATCH } from '@/app/api/generations/[id]/cover/route'
import { setAudioCoverImage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

const mockSetCover = vi.mocked(setAudioCoverImage)
const mockEnsureUser = vi.mocked(ensureUser)

const routeParams = (id: string) => ({
  params: Promise.resolve({ id }),
})

const COVER_URL = 'https://cdn.example.com/cover.png'

function patchCover(id: string, body: unknown) {
  return new NextRequest(
    new URL(`/api/generations/${id}/cover`, 'http://localhost:3000'),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

describe('PATCH /api/generations/[id]/cover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER as never)
    mockSetCover.mockResolvedValue({ id: 'gen_123', previewUrl: COVER_URL })
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPATCH('/api/generations/gen_123/cover')
    const res = await PATCH(req, routeParams('gen_123'))
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 400 for an invalid cover URL', async () => {
    const req = patchCover('gen_123', { coverImageUrl: 'not-a-url' })
    const res = await PATCH(req, routeParams('gen_123'))

    expect(res.status).toBe(400)
    expect(mockSetCover).not.toHaveBeenCalled()
  })

  it('returns 404 when the audio asset is missing or not owned', async () => {
    mockSetCover.mockResolvedValue(null)
    const req = patchCover('gen_999', { coverImageUrl: COVER_URL })
    const res = await PATCH(req, routeParams('gen_999'))
    const json = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Audio asset not found or access denied')
  })

  it('sets the cover and returns the updated preview on success', async () => {
    const req = patchCover('gen_123', { coverImageUrl: COVER_URL })
    const res = await PATCH(req, routeParams('gen_123'))
    const json = await parseJSON<{
      success: boolean
      data: { id: string; previewUrl: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({ id: 'gen_123', previewUrl: COVER_URL })
    expect(mockSetCover).toHaveBeenCalledWith(
      'gen_123',
      FAKE_DB_USER.id,
      COVER_URL,
    )
  })
})
