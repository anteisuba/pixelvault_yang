import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { CreateVoiceCardRequest } from '@/types'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'

const mockEnsureUser = vi.fn()
const mockFindActiveKeyForAdapter = vi.fn()
const mockGetVoice = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: (...args: unknown[]) =>
    mockFindActiveKeyForAdapter(...args),
}))

vi.mock('@/services/fish-audio-voice.service', () => ({
  getVoice: (...args: unknown[]) => mockGetVoice(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    voiceCard: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}))

import {
  createClonedVoiceCard,
  createVoiceCard,
  deleteVoiceCard,
  getVoiceCard,
  listVoiceCards,
  updateVoiceCard,
} from '@/services/voice-card.service'

const FAKE_USER = { id: 'db_user_123', clerkId: 'clerk_test_user' }
const FAKE_API_KEY = { keyValue: 'fish-api-key' }

const FAKE_VOICE_CARD = {
  id: 'voice_card_123',
  userId: 'db_user_123',
  name: 'Narrator',
  provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
  modelId: 'fish-audio-s2-pro',
  voiceId: 'voice_123',
  referenceAudioUrl: null,
  referenceAudioStorageKey: null,
  gender: null,
  age: null,
  tone: [],
  pace: VOICE_CARD_DEFAULT_PACE,
  pitch: null,
  pronunciationDictionary: {},
  sampleText: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const VALID_INPUT: CreateVoiceCardRequest = {
  name: 'Narrator',
  provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
  modelId: 'fish-audio-s2-pro',
  voiceId: 'voice_123',
  tone: [],
  pace: VOICE_CARD_DEFAULT_PACE,
  pronunciationDictionary: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(FAKE_USER)
  mockFindActiveKeyForAdapter.mockResolvedValue(FAKE_API_KEY)
  mockGetVoice.mockResolvedValue({ id: 'voice_123' })
  mockCreate.mockResolvedValue(FAKE_VOICE_CARD)
  mockFindMany.mockResolvedValue([FAKE_VOICE_CARD])
  mockCount.mockResolvedValue(1)
  mockFindFirst.mockResolvedValue(FAKE_VOICE_CARD)
  mockUpdate.mockResolvedValue({ ...FAKE_VOICE_CARD, name: 'Updated' })
  mockUpdateMany.mockResolvedValue({ count: 1 })
})

describe('createVoiceCard', () => {
  it('creates a voice card owned by the authenticated user', async () => {
    const result = await createVoiceCard('clerk_test_user', VALID_INPUT)

    expect(result.id).toBe('voice_card_123')
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'db_user_123',
        name: 'Narrator',
        provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
        voiceId: 'voice_123',
      }),
    })
  })

  it('validates a Fish Audio voice before creating the card', async () => {
    await createVoiceCard('clerk_test_user', VALID_INPUT)

    expect(mockFindActiveKeyForAdapter).toHaveBeenCalledWith(
      'db_user_123',
      AI_ADAPTER_TYPES.FISH_AUDIO,
    )
    expect(mockGetVoice).toHaveBeenCalledWith('fish-api-key', 'voice_123')
  })

  it('skips Fish Audio validation when voiceId is omitted', async () => {
    await createVoiceCard('clerk_test_user', {
      ...VALID_INPUT,
      voiceId: undefined,
    })

    expect(mockGetVoice).not.toHaveBeenCalled()
  })

  it('fails when Fish Audio voice validation fails', async () => {
    mockGetVoice.mockRejectedValueOnce(new Error('not found'))

    await expect(
      createVoiceCard('clerk_test_user', VALID_INPUT),
    ).rejects.toMatchObject({
      errorCode: 'VOICE_NOT_FOUND',
      httpStatus: 400,
    })

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects voiceId for providers without voice library support', async () => {
    await expect(
      createVoiceCard('clerk_test_user', {
        ...VALID_INPUT,
        provider: VOICE_CARD_PROVIDER.FAL_F5TTS,
        voiceId: 'bogus-id',
      }),
    ).rejects.toThrow(/supported voice providers/i)

    expect(mockGetVoice).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('createClonedVoiceCard', () => {
  it('creates a local Fish Audio S2 Pro card without remote validation', async () => {
    const result = await createClonedVoiceCard('clerk_test_user', {
      name: 'Cloned Narrator',
      voiceId: 'voice_cloned_123',
      referenceAudioUrl: 'https://cdn.example.com/sample.mp3',
      sampleText: 'sample transcript',
    })

    expect(result.id).toBe('voice_card_123')
    expect(mockFindActiveKeyForAdapter).not.toHaveBeenCalled()
    expect(mockGetVoice).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'db_user_123',
        name: 'Cloned Narrator',
        provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
        modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
        voiceId: 'voice_cloned_123',
        referenceAudioUrl: 'https://cdn.example.com/sample.mp3',
        sampleText: 'sample transcript',
      }),
    })
  })
})

describe('listVoiceCards', () => {
  it('returns paginated voice cards and total count', async () => {
    const result = await listVoiceCards('clerk_test_user', 2, 20)

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'db_user_123',
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
    })
  })
})

describe('getVoiceCard', () => {
  it('returns a matching non-deleted voice card', async () => {
    const result = await getVoiceCard('clerk_test_user', 'voice_card_123')

    expect(result?.id).toBe('voice_card_123')
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'voice_card_123',
        userId: 'db_user_123',
        isDeleted: false,
      },
    })
  })

  it('returns null when the card is not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const result = await getVoiceCard('clerk_test_user', 'missing')

    expect(result).toBeNull()
  })
})

describe('updateVoiceCard', () => {
  it('updates an owned voice card', async () => {
    const result = await updateVoiceCard('clerk_test_user', 'voice_card_123', {
      name: 'Updated',
      pace: 'fast',
    })

    expect(result.name).toBe('Updated')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'voice_card_123' },
      data: {
        name: 'Updated',
        pace: 'fast',
      },
    })
  })

  it('throws not found when updating a missing card', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    await expect(
      updateVoiceCard('clerk_test_user', 'missing', { name: 'Updated' }),
    ).rejects.toMatchObject({
      errorCode: 'VOICE_CARD_NOT_FOUND',
      httpStatus: 404,
    })
  })

  it('rejects changing provider to one without voice library support while voiceId exists', async () => {
    await expect(
      updateVoiceCard('clerk_test_user', 'voice_card_123', {
        provider: VOICE_CARD_PROVIDER.FAL_F5TTS,
      }),
    ).rejects.toThrow(/supported voice providers/i)

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('deleteVoiceCard', () => {
  it('soft-deletes the voice card', async () => {
    await deleteVoiceCard('clerk_test_user', 'voice_card_123')

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'voice_card_123',
        userId: 'db_user_123',
        isDeleted: false,
      },
      data: { isDeleted: true },
    })
  })

  it('throws not found when no row is updated', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      deleteVoiceCard('clerk_test_user', 'missing'),
    ).rejects.toMatchObject({
      errorCode: 'VOICE_CARD_NOT_FOUND',
      httpStatus: 404,
    })
  })
})
