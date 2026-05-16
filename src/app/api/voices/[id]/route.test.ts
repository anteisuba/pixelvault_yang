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

vi.mock('@/lib/platform-keys', () => ({
  getFishAudioVoiceLibraryApiKey: vi.fn(),
}))

import { GET, DELETE } from './route'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { getVoice, deleteVoice } from '@/services/fish-audio-voice.service'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'

const mockEnsureUser = vi.mocked(ensureUser)
const mockFindActiveKeyForAdapter = vi.mocked(findActiveKeyForAdapter)
const mockGetVoice = vi.mocked(getVoice)
const mockDeleteVoice = vi.mocked(deleteVoice)
const mockGetFishAudioVoiceLibraryApiKey = vi.mocked(
  getFishAudioVoiceLibraryApiKey,
)

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
  mockGetFishAudioVoiceLibraryApiKey.mockReturnValue('public-fish-key')
  mockGetVoice.mockResolvedValue(FAKE_VOICE)
  mockDeleteVoice.mockResolvedValue(undefined)
})

describe('GET /api/voices/[id]', () => {
  it('returns public voice detail without requiring user auth or user key', async () => {
    mockUnauthenticated()

    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=900',
    )
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE)
    expect(mockEnsureUser).not.toHaveBeenCalled()
    expect(mockFindActiveKeyForAdapter).not.toHaveBeenCalled()
    expect(mockGetVoice).toHaveBeenCalledWith('public-fish-key', VOICE_ID)
  })

  it('returns 503 when the public voice library key is missing', async () => {
    mockGetFishAudioVoiceLibraryApiKey.mockReturnValue(null)

    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{
      success: boolean
      errorCode: string
    }>(res)

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe(
      VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
    )
    expect(mockGetVoice).not.toHaveBeenCalled()
  })

  it('returns public voice detail on success', async () => {
    const res = await GET(createGET(`/api/voices/${VOICE_ID}`), routeParams)
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE)
    expect(mockGetVoice).toHaveBeenCalledWith('public-fish-key', VOICE_ID)
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
