import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createDELETE,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
}))

vi.mock('@/services/fish-audio-voice.service', () => ({
  getVoice: vi.fn(),
  deleteVoice: vi.fn(),
}))

import { GET, DELETE } from './route'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import {
  getVoice,
  deleteVoice,
} from '@/services/fish-audio-voice.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockFindActiveKeyForAdapter = vi.mocked(findActiveKeyForAdapter)
const mockGetVoice = vi.mocked(getVoice)
const mockDeleteVoice = vi.mocked(deleteVoice)

const VOICE_ID = 'voice_123'
const routeParams = { params: Promise.resolve({ id: VOICE_ID }) }

const FAKE_API_KEY = {
  id: 'key_fish',
  keyValue: 'fish-api-key',
  adapterType: 'fish_audio',
}

const FAKE_VOICE = {
  id: VOICE_ID,
  title: 'Narrator',
  description: null,
  coverImage: null,
  state: 'created' as const,
  languages: ['en'],
  tags: [],
  samples: [],
  likeCount: 0,
  taskCount: 0,
  visibility: 'private' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  author: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockFindActiveKeyForAdapter.mockResolvedValue(FAKE_API_KEY as never)
  mockGetVoice.mockResolvedValue(FAKE_VOICE)
  mockDeleteVoice.mockResolvedValue(undefined)
})

describe('GET /api/voices/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockGetVoice).not.toHaveBeenCalled()
  })

  it('returns 400 when the user has no active Fish Audio API key', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)

    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockGetVoice).not.toHaveBeenCalled()
  })

  it('returns voice detail on success', async () => {
    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE)
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockGetVoice).toHaveBeenCalledWith('fish-api-key', VOICE_ID)
  })
})

describe('DELETE /api/voices/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await DELETE(
      createDELETE(`/api/voices/${VOICE_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockDeleteVoice).not.toHaveBeenCalled()
  })

  it('deletes voice on success', async () => {
    const res = await DELETE(
      createDELETE(`/api/voices/${VOICE_ID}`),
      routeParams,
    )

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(mockDeleteVoice).toHaveBeenCalledWith('fish-api-key', VOICE_ID)
  })
})
