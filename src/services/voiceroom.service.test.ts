import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    voiceCard: { findFirst: vi.fn() },
    characterCard: { findFirst: vi.fn() },
  },
  submitAudioGeneration: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/services/generate-audio.service', () => ({
  submitAudioGeneration: mocks.submitAudioGeneration,
}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))

import { dispatchLine } from './voiceroom.service'

const MEMBER = {
  id: 'voice-1',
  kind: 'voice' as const,
  name: 'Warm',
  coverImage: null,
}

function dispatch() {
  return dispatchLine({
    clerkId: 'clerk-1',
    userId: 'user-1',
    member: MEMBER,
    text: '在的。',
    emotion: null,
    delivery: { pace: 'normal', expressiveness: 'auto' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.voiceCard.findFirst.mockResolvedValue({
    voiceId: 'fish-ref',
    name: 'Warm',
    coverImage: 'https://cdn.example.com/voice.png',
  })
  mocks.submitAudioGeneration.mockResolvedValue({ jobId: 'job-1' })
})

describe('dispatchLine — 素材库头像规则 (owner 10-23)', () => {
  it('labels the audio with the bound character’s name and cover', async () => {
    mocks.db.characterCard.findFirst.mockResolvedValue({
      name: 'Denia',
      looks: [
        {
          id: 'look-1',
          label: null,
          isDefault: true,
          description: null,
          tags: [],
          referenceSlots: [
            {
              id: 'slot-1',
              role: 'identity',
              url: 'https://cdn.example.com/denia.png',
              isPrimary: true,
            },
          ],
        },
      ],
    })

    await expect(dispatch()).resolves.toBe('job-1')
    expect(mocks.submitAudioGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        voiceId: 'fish-ref',
        voiceName: 'Denia',
        coverImageUrl: 'https://cdn.example.com/denia.png',
      }),
    )
  })

  it('falls back to the voice card when no character is bound', async () => {
    mocks.db.characterCard.findFirst.mockResolvedValue(null)

    await dispatch()
    expect(mocks.submitAudioGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        voiceName: 'Warm',
        coverImageUrl: 'https://cdn.example.com/voice.png',
      }),
    )
  })
})
