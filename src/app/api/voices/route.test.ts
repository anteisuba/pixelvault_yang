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

import { GET, POST } from './route'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import {
  listVoices,
  createVoice,
} from '@/services/fish-audio-voice.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockFindActiveKeyForAdapter = vi.mocked(findActiveKeyForAdapter)
const mockListVoices = vi.mocked(listVoices)
const mockCreateVoice = vi.mocked(createVoice)

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
  mockListVoices.mockResolvedValue(FAKE_VOICE_LIST)
  mockCreateVoice.mockResolvedValue(FAKE_VOICE)
})

describe('GET /api/voices', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/voices'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockListVoices).not.toHaveBeenCalled()
  })

  it('returns 400 when the user has no active Fish Audio API key', async () => {
    mockFindActiveKeyForAdapter.mockResolvedValue(null)

    const res = await GET(createGET('/api/voices'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
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
        self: 'true',
        page: '2',
        pageSize: '10',
        search: 'narrator',
        language: 'en',
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
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)
    const params = mockCreateVoice.mock.calls[0]?.[1]

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(FAKE_VOICE)
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
  })
})
