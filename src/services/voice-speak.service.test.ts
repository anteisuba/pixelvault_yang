import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    assistantPersona: { findUnique: vi.fn() },
    voiceCard: { findFirst: vi.fn() },
    characterCard: { findFirst: vi.fn() },
    generation: { findMany: vi.fn() },
  },
  submitAudioGeneration: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/services/generate-audio.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/services/generate-audio.service')
  >()),
  submitAudioGeneration: mocks.submitAudioGeneration,
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import { AI_MODELS } from '@/constants/models'

import { listVoiceBenchLines, speakAsPersona } from './voice-speak.service'

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

describe('配音台（③）', () => {
  it('台词里插的语气标记原样念（句中也行）', async () => {
    mocks.db.assistantPersona.findUnique.mockResolvedValue({
      characterCard: { voiceCardId: 'voice-card-1', isDeleted: false },
    })
    await speakAsPersona('clerk-1', {
      text: '[whispering]别回头，[sighing]走吧',
    })
    const prompt = mocks.submitAudioGeneration.mock.calls[0]![1].prompt
    expect(prompt).toBe('[whispering]别回头，[sighing]走吧')
  })

  it('台词 = 素材库里她这副嗓子念过的音频，旧的在前', async () => {
    mocks.db.assistantPersona.findUnique.mockResolvedValue({
      characterCard: {
        id: 'card-1',
        voiceCardId: 'voice-card-1',
        isDeleted: false,
      },
    })
    mocks.db.generation.findMany.mockResolvedValue([
      {
        id: 'g2',
        prompt: '[pause] 请保持安静哦。',
        url: 'https://cdn.test/g2.mp3',
        duration: 2,
        createdAt: new Date('2026-10-26T10:01:00Z'),
      },
      {
        id: 'g1',
        prompt: '欢迎来到图书馆。',
        url: 'https://cdn.test/g1.mp3',
        duration: null,
        createdAt: new Date('2026-10-26T10:00:00Z'),
      },
    ])
    const data = await listVoiceBenchLines('clerk-1')
    expect(data.characterCardId).toBe('card-1')
    expect(data.lines.map((line) => line.id)).toEqual(['g1', 'g2'])
    expect(mocks.db.generation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          outputType: 'AUDIO',
          snapshot: { path: ['voiceId'], equals: 'fish-1' },
        }),
      }),
    )
  })

  it('默认助手 / 没绑嗓子：空台，⛔ 查素材库', async () => {
    mocks.db.assistantPersona.findUnique.mockResolvedValue({
      characterCard: null,
    })
    await expect(listVoiceBenchLines('clerk-1')).resolves.toEqual({
      characterCardId: null,
      voiceCardId: null,
      lines: [],
    })
    mocks.db.assistantPersona.findUnique.mockResolvedValue({
      characterCard: { id: 'card-1', voiceCardId: null, isDeleted: false },
    })
    await expect(listVoiceBenchLines('clerk-1')).resolves.toEqual({
      characterCardId: 'card-1',
      voiceCardId: null,
      lines: [],
    })
    expect(mocks.db.generation.findMany).not.toHaveBeenCalled()
  })
})
