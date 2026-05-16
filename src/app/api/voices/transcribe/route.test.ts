import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
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
  transcribeAudio: vi.fn(),
}))

import { POST } from './route'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { transcribeAudio } from '@/services/fish-audio-voice.service'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'

const mockEnsureUser = vi.mocked(ensureUser)
const mockFindActiveKeyForAdapter = vi.mocked(findActiveKeyForAdapter)
const mockTranscribeAudio = vi.mocked(transcribeAudio)

const FAKE_API_KEY = {
  id: 'key_fish',
  keyValue: 'fish-api-key',
  adapterType: 'fish_audio',
}

function createTranscribePOST(formData: FormData) {
  return new NextRequest(
    new URL('/api/voices/transcribe', 'http://localhost:3000'),
    {
      method: 'POST',
      body: formData,
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockFindActiveKeyForAdapter.mockResolvedValue(FAKE_API_KEY as never)
  mockTranscribeAudio.mockResolvedValue({
    text: 'Hello world',
    duration: 1.2,
    segments: [],
  })
})

describe('POST /api/voices/transcribe', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const formData = new FormData()

    const res = await POST(createTranscribePOST(formData))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockTranscribeAudio).not.toHaveBeenCalled()
  })

  it('returns 400 when the user has no active Fish Audio API key', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)
    const formData = new FormData()

    const res = await POST(createTranscribePOST(formData))
    const body = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe(VOICE_API_ERROR_CODES.MISSING_API_KEY)
    expect(mockTranscribeAudio).not.toHaveBeenCalled()
  })

  it('transcribes uploaded audio with the saved Fish Audio key', async () => {
    const formData = new FormData()
    formData.append(
      'audio',
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    )
    formData.append('ignore_timestamps', 'true')

    const res = await POST(createTranscribePOST(formData))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      text: 'Hello world',
      duration: 1.2,
      segments: [],
    })
    expect(mockTranscribeAudio).toHaveBeenCalledWith(
      'fish-api-key',
      expect.objectContaining({
        ignoreTimestamps: true,
      }),
    )
  })
})
