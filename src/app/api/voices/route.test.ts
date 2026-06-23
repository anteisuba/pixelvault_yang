import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
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
  listVoices: vi.fn(),
  createVoice: vi.fn(),
}))

vi.mock('@/lib/platform-keys', () => ({
  getFishAudioVoiceLibraryApiKey: vi.fn(),
}))

vi.mock('@/services/cards/voice-card.service', () => ({
  createClonedVoiceCard: vi.fn(),
}))

import { GET, POST } from './route'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { listVoices, createVoice } from '@/services/fish-audio-voice.service'
import { getFishAudioVoiceLibraryApiKey } from '@/lib/platform-keys'
import { createClonedVoiceCard } from '@/services/cards/voice-card.service'
import { AI_MODELS } from '@/constants/models'
import { VOICE_API_ERROR_CODES } from '@/constants/voice-cards'

const mockEnsureUser = vi.mocked(ensureUser)
const mockFindActiveKeyForAdapter = vi.mocked(findActiveKeyForAdapter)
const mockListVoices = vi.mocked(listVoices)
const mockCreateVoice = vi.mocked(createVoice)
const mockGetFishAudioVoiceLibraryApiKey = vi.mocked(
  getFishAudioVoiceLibraryApiKey,
)
const mockCreateClonedVoiceCard = vi.mocked(createClonedVoiceCard)

const FAKE_API_KEY = {
  id: 'key_fish',
  keyValue: 'fish-api-key',
  adapterType: 'fish_audio',
}

const FAKE_VOICE = {
  id: 'voice_123',
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

const FAKE_VOICE_CARD = {
  id: 'voice_card_123',
  userId: 'db_user_123',
  name: 'Narrator',
  provider: 'fish_audio',
  modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
  voiceId: 'voice_123',
  coverImage: null,
  referenceAudioUrl: null,
  referenceAudioStorageKey: null,
  gender: null,
  age: null,
  tone: [],
  pace: 'normal',
  pitch: null,
  pronunciationDictionary: {},
  sampleText: 'sample transcript',
  isDeleted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const FAKE_VOICE_LIST = {
  total: 1,
  items: [FAKE_VOICE],
}

function createFormPOST(formData: FormData) {
  return new NextRequest(new URL('/api/voices', 'http://localhost:3000'), {
    method: 'POST',
    body: formData,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockFindActiveKeyForAdapter.mockResolvedValue(FAKE_API_KEY as never)
  mockGetFishAudioVoiceLibraryApiKey.mockReturnValue('public-fish-key')
  mockListVoices.mockResolvedValue(FAKE_VOICE_LIST)
  mockCreateVoice.mockResolvedValue(FAKE_VOICE)
  mockCreateClonedVoiceCard.mockResolvedValue(FAKE_VOICE_CARD as never)
})

describe('GET /api/voices', () => {
  it('lists public voices without requiring user auth or user key', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/voices'))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=900',
    )
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE_LIST)
    expect(mockEnsureUser).not.toHaveBeenCalled()
    expect(mockFindActiveKeyForAdapter).not.toHaveBeenCalled()
    expect(mockListVoices).toHaveBeenCalledWith('public-fish-key', {
      pageSize: 20,
      pageNumber: 1,
      title: undefined,
      language: undefined,
      sortBy: undefined,
    })
  })

  it('returns 503 for public voices when the library key is missing', async () => {
    mockGetFishAudioVoiceLibraryApiKey.mockReturnValue(null)

    const res = await GET(createGET('/api/voices'))
    const body = await parseJSON<{
      success: boolean
      errorCode: string
    }>(res)

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe(
      VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
    )
    expect(mockListVoices).not.toHaveBeenCalled()
  })

  it('returns 401 for cloned voices when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/voices', { self: 'true' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockListVoices).not.toHaveBeenCalled()
  })

  it('returns 400 when cloned voices have no active Fish Audio API key', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)

    const res = await GET(createGET('/api/voices', { self: 'true' }))
    const body = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe(VOICE_API_ERROR_CODES.MISSING_API_KEY)
    expect(mockListVoices).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid query parameters', async () => {
    const res = await GET(createGET('/api/voices', { page: '0' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockListVoices).not.toHaveBeenCalled()
  })

  it('lists voices with validated query options', async () => {
    const res = await GET(
      createGET('/api/voices', {
        page: '2',
        pageSize: '10',
        search: 'narrator',
        language: 'en',
        sortBy: 'task_count',
      }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE_LIST)
    expect(mockEnsureUser).not.toHaveBeenCalled()
    expect(mockListVoices).toHaveBeenCalledWith('public-fish-key', {
      pageSize: 10,
      pageNumber: 2,
      title: 'narrator',
      language: 'en',
      sortBy: 'task_count',
    })
  })

  it('lists cloned voices with the user Fish Audio key', async () => {
    const res = await GET(
      createGET('/api/voices', {
        self: 'true',
        page: '2',
        pageSize: '10',
        search: 'narrator',
        language: 'en',
        sortBy: 'task_count',
      }),
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE_LIST)
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockListVoices).toHaveBeenCalledWith('fish-api-key', {
      self: true,
      pageSize: 10,
      pageNumber: 2,
      title: 'narrator',
      language: 'en',
      sortBy: 'task_count',
    })
  })
})

describe('POST /api/voices', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const formData = new FormData()
    formData.append('title', 'Narrator')

    const res = await POST(createFormPOST(formData))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockCreateVoice).not.toHaveBeenCalled()
  })

  it('returns 400 when the user has no active Fish Audio API key', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)
    const formData = new FormData()
    formData.append('title', 'Narrator')

    const res = await POST(createFormPOST(formData))
    const body = await parseJSON<{
      success: boolean
      error: string
      errorCode: string
    }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe(VOICE_API_ERROR_CODES.MISSING_API_KEY)
    expect(mockCreateVoice).not.toHaveBeenCalled()
  })

  it('returns 400 when title is missing', async () => {
    const formData = new FormData()
    formData.append(
      'voices',
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    )

    const res = await POST(createFormPOST(formData))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateVoice).not.toHaveBeenCalled()
  })

  it('returns 400 when no voice files are uploaded', async () => {
    const formData = new FormData()
    formData.append('title', 'Narrator')

    const res = await POST(createFormPOST(formData))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateVoice).not.toHaveBeenCalled()
  })

  it('creates a private cloned voice with uploaded audio', async () => {
    const formData = new FormData()
    formData.append('title', 'Narrator')
    formData.append('description', 'Clean narration voice')
    formData.append('texts', 'sample transcript')
    formData.append('enhance_audio_quality', 'true')
    formData.append(
      'voices',
      new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' }),
    )

    const res = await POST(createFormPOST(formData))
    const body = await parseJSON<{
      success: boolean
      data: unknown
      voiceCard: unknown
    }>(res)
    const params = mockCreateVoice.mock.calls[0]?.[1]

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE)
    expect(body.voiceCard).toEqual(FAKE_VOICE_CARD)
    expect(mockCreateVoice).toHaveBeenCalledWith(
      'fish-api-key',
      expect.objectContaining({
        title: 'Narrator',
        texts: ['sample transcript'],
        visibility: 'private',
        description: 'Clean narration voice',
        enhanceAudioQuality: true,
      }),
    )
    expect(params?.voices).toHaveLength(1)
    expect(params?.voiceFileNames).toHaveLength(1)
    expect(mockCreateClonedVoiceCard).toHaveBeenCalledWith('clerk_test_user', {
      name: 'Narrator',
      voiceId: 'voice_123',
      referenceAudioUrl: null,
      sampleText: 'sample transcript',
    })
  })
})
