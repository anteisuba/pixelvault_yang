/**
 * L2a 真库：当场出声的那几条（Fish 直连配音、ElevenLabs 音效 / 音乐 / v3 语音）。
 * 只假边界：服务商（fetch）、R2 的真 I/O。选路、真解密、拼提示词、落作品 / 任务 / 用量全真：
 * 核发给服务商的请求体与库里的行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { EXPRESSIVENESS_TO_FISH_TEMPERATURE } from '@/constants/audio-options'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  generateAudioForUser,
  generateSoundEffectForUser,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  FAKE_AUDIO_BYTES,
  installFakeAudioProviders,
  type FakeAudioProviders,
} from '@/test/int/fake-audio-providers'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import type { GenerateAudioRequest } from '@/types'

let me: Awaited<ReturnType<typeof createTestUser>>
let providers: FakeAudioProviders

const FISH: GenerateAudioRequest = {
  prompt: 'Hello world',
  modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
}

/** 这次发给 Fish 的请求体。 */
function fishBody() {
  const calls = providers.calls.filter((c) => c.name.startsWith('fish'))
  expect(calls).toHaveLength(1)
  return calls[0]!.json
}

async function onlyGeneration() {
  const rows = await db.generation.findMany({ where: { userId: me.id } })
  expect(rows).toHaveLength(1)
  return rows[0]!
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  providers = installFakeAudioProviders()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generateAudioForUser（Fish 当场出声）', () => {
  beforeEach(async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FISH_AUDIO)
  })

  it('出好：音频进桶、落一行作品、任务完成、用量记在这次任务上', async () => {
    const result = await generateAudioForUser(me.clerkId, FISH)

    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: result.jobId },
    })
    const row = await onlyGeneration()
    expect(job).toMatchObject({ status: 'COMPLETED', generationId: row.id })
    expect(row).toMatchObject({
      outputType: 'AUDIO',
      prompt: 'Hello world',
      model: AI_MODELS.FISH_AUDIO_S2_PRO,
      previewUrl: null,
    })
    expect(row.url).toBe(`${FAKE_CDN}/${row.storageKey}`)
    expect(fakeBucket.objects.get(row.storageKey)).toEqual(FAKE_AUDIO_BYTES)
    const usage = await db.apiUsageLedger.findMany({ where: { userId: me.id } })
    expect(usage).toEqual([
      expect.objectContaining({
        generationId: row.id,
        generationJobId: job.id,
        wasSuccessful: true,
      }),
    ])
    // Fish 要的是执行 id（s2.1-pro），不是目录里的稳定 id。
    const call = providers.callsTo('fish')[0]!
    expect(call.headers.get('model')).toBe('s2.1-pro')
    expect(call.headers.get('authorization')).toBe(
      'Bearer sk-test-not-a-real-key',
    )
  })

  it('封面按引用记在 previewUrl（⛔ 复制进桶）', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      coverImageUrl: 'https://cdn.example.com/voice-cover.png',
    })

    expect((await onlyGeneration()).previewUrl).toBe(
      'https://cdn.example.com/voice-cover.png',
    )
    expect(fakeBucket.uploads).toHaveLength(1)
  })

  it('参考音频 + 文字稿、采样率原样带给 Fish', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      referenceAudioUrl: 'https://cdn.example.com/reference.wav',
      referenceText: ' Reference voice transcript ',
      sampleRate: 22050,
    })

    expect(fishBody()).toMatchObject({
      sample_rate: 22050,
      references: [
        {
          audio: 'https://cdn.example.com/reference.wav',
          text: 'Reference voice transcript',
        },
      ],
    })
  })

  it('语速、停顿、读音词典：改写发给 Fish 的那句，作品上留用户原话', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      prompt: 'Say Codex clearly. Continue now.',
      pace: 'fast',
      pauseMarkers: ['after_sentence_1'],
      pronunciationDictionary: { Codex: 'koh-decks' },
    })

    // ⚠ 停顿是 Fish 的 `[break]` 标记，不是 `\n\n`（2026-08-30 对文档后退场）。
    expect(fishBody()).toMatchObject({
      text: 'Say koh-decks clearly.[break] Continue now.',
      prosody: { speed: 1.35 },
    })
    expect((await onlyGeneration()).prompt).toBe(
      'Say Codex clearly. Continue now.',
    )
  })

  it('读音词典 ⛔ 改长词里的同一串（AIM 里的 AI 不动）', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      prompt: 'I AIM to use AI wisely',
      pronunciationDictionary: { AI: 'artificial intelligence' },
    })

    expect(fishBody().text).toBe('I AIM to use artificial intelligence wisely')
  })

  /** ⭐ 中文句间**不塞空格**——同 `applyAudioStylePrompt` 那条原则。 */
  it('中文停顿：句间只插 [break]，⛔ 加空格', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      prompt: '第一句。第二句。第三句。',
      pauseMarkers: ['after_sentence_1', 'after_sentence_2'],
    })

    expect(fishBody().text).toBe('第一句。[break]第二句。[break]第三句。')
  })

  it.each([
    // 「旁白」用 Fish 标记表里查得到的 `soft tone`（原先自造的 `narrating` 被静默当成别的）。
    ['narration', 'Speak kindly.', '[soft tone] Speak kindly.'],
    // 只在开头插一次（Fish 文档：短文本别滥用情绪标记）。
    [
      'excited',
      'First line. Second line.',
      '[excited] First line. Second line.',
    ],
    // 中日文标记后 ⛔ 加空格；`whispering` 不是 `whispers`。
    ['whisper', '别回头，别出声。', '[whispering]别回头，别出声。'],
  ] as const)('情绪 %s：开头一个标记', async (emotion, prompt, sent) => {
    await generateAudioForUser(me.clerkId, { ...FISH, prompt, emotion })

    expect(fishBody()).toMatchObject({
      text: sent,
      // 有情绪没选档 → dramatic
      temperature: EXPRESSIVENESS_TO_FISH_TEMPERATURE.dramatic,
    })
  })

  it('没情绪：表现力按 natural', async () => {
    await generateAudioForUser(me.clerkId, { ...FISH, prompt: 'Plain line.' })

    expect(fishBody()).toMatchObject({
      text: 'Plain line.',
      temperature: EXPRESSIVENESS_TO_FISH_TEMPERATURE.natural,
    })
  })

  it('高级参数全带给 Fish；要时间戳时走流式接口，时间戳记进作品快照', async () => {
    await generateAudioForUser(me.clerkId, {
      ...FISH,
      speakerVoiceIds: ['voice-a', 'voice-b'],
      volume: 2,
      normalizeLoudness: true,
      normalizeText: true,
      withTimestamps: true,
      format: 'opus',
      sampleRate: 48000,
      opusBitrate: 32000,
      latency: 'balanced',
      temperature: 0.8,
      topP: 0.75,
      chunkLength: 120,
      repetitionPenalty: 1.25,
    })

    expect(providers.callsTo('fish-timestamps')).toHaveLength(1)
    expect(fishBody()).toMatchObject({
      reference_id: ['voice-a', 'voice-b'],
      prosody: { volume: 2, normalize_loudness: true },
      normalize: true,
      format: 'opus',
      sample_rate: 48000,
      opus_bitrate: 32000,
      latency: 'balanced',
      temperature: 0.8,
      top_p: 0.75,
      chunk_length: 120,
      repetition_penalty: 1.25,
    })
    expect((await onlyGeneration()).snapshot).toMatchObject({
      audioFormat: 'opus',
      timestamps: [{ text: 'Hello', start: 0, end: 0.4 }],
    })
  })

  it('服务商报错：任务判失败、交回服务商的状态码，⛔ 落作品', async () => {
    providers.reply('fish', () => new Response('bad voice', { status: 400 }))

    await expect(generateAudioForUser(me.clerkId, FISH)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 400,
    })
    const [job] = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(job).toMatchObject({ status: 'FAILED' })
    expect(job!.errorMessage).toContain('bad voice')
    expect(await db.generation.count()).toBe(0)
  })

  it('转存失败：任务判失败、原话往上抛', async () => {
    const { uploadToR2 } = await import('@/services/storage/r2')
    vi.mocked(uploadToR2).mockRejectedValueOnce(
      new Error('R2 connection refused'),
    )

    await expect(generateAudioForUser(me.clerkId, FISH)).rejects.toThrow(
      'R2 connection refused',
    )
    const [job] = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(job).toMatchObject({
      status: 'FAILED',
      errorMessage: 'R2 connection refused',
    })
  })
})

describe('ElevenLabs：音效 / 音乐（当场出声）', () => {
  beforeEach(async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.ELEVENLABS)
  })

  it('音效：时长 / 循环 / 贴合度带给 ElevenLabs，落成完成的任务', async () => {
    const result = await generateSoundEffectForUser(me.clerkId, {
      prompt: 'thunder rumbling in the distance',
      modelId: AI_MODELS.ELEVENLABS_SFX_V2,
      durationSeconds: 5,
      loop: true,
      promptInfluence: 0.6,
    })

    expect(providers.callsTo('eleven-sfx')[0]!.json).toEqual({
      text: 'thunder rumbling in the distance',
      duration_seconds: 5,
      loop: true,
      prompt_influence: 0.6,
    })
    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: result.jobId },
    })
    expect(job.status).toBe('COMPLETED')
    expect((await onlyGeneration()).duration).toBe(5)
  })

  it.each([4000, 4100])(
    '音乐 %i 字：收下，执行用 v2.5、作品上记目录里的型号',
    async (length) => {
      const prompt = 'a'.repeat(length)

      await submitAudioGeneration(me.clerkId, {
        prompt,
        modelId: AI_MODELS.ELEVENLABS_MUSIC_V2,
        durationSeconds: 30,
      })

      expect(providers.callsTo('eleven-music')[0]!.json).toEqual({
        prompt,
        model_id: 'music_v2_5',
        music_length_ms: 30_000,
      })
      expect(await onlyGeneration()).toMatchObject({
        model: AI_MODELS.ELEVENLABS_MUSIC_V2,
        prompt,
      })
      expect(providers.worker.requests).toEqual([])
    },
  )

  it('音乐 4101 字：400，⛔ 建任务、⛔ 打服务商', async () => {
    await expect(
      submitAudioGeneration(me.clerkId, {
        prompt: 'a'.repeat(4101),
        modelId: AI_MODELS.ELEVENLABS_MUSIC_V2,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(await db.generationJob.count()).toBe(0)
    expect(providers.calls).toEqual([])
  })
})
