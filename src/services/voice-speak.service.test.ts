import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    assistantPersona: { findUnique: vi.fn() },
    voiceCard: { findFirst: vi.fn() },
    characterCard: { findFirst: vi.fn() },
  },
  submitAudioGeneration: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/services/generate-audio.service', () => ({
  submitAudioGeneration: mocks.submitAudioGeneration,
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import { AI_MODELS } from '@/constants/models'

import { speakAsPersona } from './voice-speak.service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.voiceCard.findFirst.mockResolvedValue({
    voiceId: 'fish-1',
    name: 'Warm',
    coverImage: null,
  })
  mocks.db.characterCard.findFirst.mockResolvedValue(null)
  mocks.submitAudioGeneration.mockResolvedValue({ jobId: 'job-1' })
})

describe('speakAsPersona（②c-2 对话里 🔊 念回复）', () => {
  it('用设置里那位角色绑的嗓子念，按选的型号；只念说的话', async () => {
    mocks.db.assistantPersona.findUnique.mockResolvedValue({
      characterCard: { voiceCardId: 'voice-card-1', isDeleted: false },
    })
    await expect(
      speakAsPersona('clerk-1', {
        text: '看 图_12 怎么样',
        modelId: AI_MODELS.FISH_AUDIO_DRAMA_3,
      }),
    ).resolves.toEqual({ jobId: 'job-1' })
    expect(mocks.db.voiceCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'voice-card-1', userId: 'user-1', isDeleted: false },
      }),
    )
    expect(mocks.submitAudioGeneration).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        modelId: AI_MODELS.FISH_AUDIO_DRAMA_3,
        voiceId: 'fish-1',
        prompt: '看 怎么样',
      }),
    )
  })

  it('默认助手 / 没绑嗓子 / 卡删了：说清楚念不了，⛔ 派任务', async () => {
    for (const characterCard of [
      null,
      { voiceCardId: null, isDeleted: false },
      { voiceCardId: 'voice-card-1', isDeleted: true },
    ]) {
      mocks.db.assistantPersona.findUnique.mockResolvedValue({ characterCard })
      await expect(
        speakAsPersona('clerk-1', { text: '在呢' }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VOICE_UNBOUND' })
    }
    expect(mocks.submitAudioGeneration).not.toHaveBeenCalled()
  })
})
