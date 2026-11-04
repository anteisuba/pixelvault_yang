/**
 * L2a 真库：用角色绑的嗓子念（voice-speak.service）。人设、角色卡、音色卡、素材库都走真库，
 * 派任务走真的语音提交（建任务、派发）；只假执行 Worker（fetch）。
 * 核派出去的任务（念什么、用哪副嗓子、哪个型号）与配音台台词的读法。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  listVoiceBenchLines,
  speakAsPersona,
} from '@/services/voice-speak.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

const WORKER = 'https://worker.test'
const worker = vi.hoisted(() => ({
  bodies: [] as Array<Record<string, unknown>>,
}))

beforeAll(() => {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FISH_AUDIO)
  worker.bodies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(WORKER)) return new Response('nope', { status: 404 })
      worker.bodies.push(JSON.parse(String(init?.body ?? 'null')))
      return Response.json({ workflowInstanceId: 'wf_1' })
    }),
  )
})

async function bindPersona(
  card: { voiceCardId?: string | null; isDeleted?: boolean } | null,
) {
  const character = card
    ? await db.characterCard.create({
        data: {
          userId: me.id,
          name: '晴',
          voiceCardId: card.voiceCardId ?? null,
          isDeleted: card.isDeleted ?? false,
        },
      })
    : null
  await db.assistantPersona.upsert({
    where: { userId: me.id },
    create: { userId: me.id, characterCardId: character?.id ?? null },
    update: { characterCardId: character?.id ?? null },
  })
  return character
}

const voiceCard = (userId: string, voiceId = 'fish-1') =>
  db.voiceCard.create({ data: { userId, name: 'Warm', voiceId } })

async function dispatched() {
  const job = await db.generationJob.findFirstOrThrow({
    where: { userId: me.id },
  })
  return { job, body: worker.bodies[0] }
}

describe('speakAsPersona（真库，假 Worker）', () => {
  it('用角色绑的嗓子、按选的型号念；只念说的话', async () => {
    const voice = await voiceCard(me.id)
    await bindPersona({ voiceCardId: voice.id })

    const { jobId } = await speakAsPersona(me.clerkId, {
      text: '看 图_12 怎么样',
      modelId: AI_MODELS.FISH_AUDIO_DRAMA_3,
    })
    const { job, body } = await dispatched()
    expect(job).toMatchObject({
      id: jobId,
      adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
      modelId: AI_MODELS.FISH_AUDIO_DRAMA_3,
    })
    expect(JSON.stringify(body)).toContain('"fish-1"')
    expect(JSON.stringify(body)).toContain('看 怎么样')
    expect(JSON.stringify(body)).not.toContain('图_12')
  })

  it('台词里的语气标记原样念（句中也行）', async () => {
    const voice = await voiceCard(me.id)
    await bindPersona({ voiceCardId: voice.id })
    await speakAsPersona(me.clerkId, {
      text: '[whispering]别回头，[sighing]走吧',
    })
    expect(JSON.stringify(worker.bodies[0])).toContain(
      '[whispering]别回头，[sighing]走吧',
    )
  })

  it('默认助手 / 没绑嗓子 / 卡删了：念不了，不建任务', async () => {
    const voice = await voiceCard(me.id)
    for (const card of [
      null,
      { voiceCardId: null },
      { voiceCardId: voice.id, isDeleted: true },
    ]) {
      await bindPersona(card)
      await expect(
        speakAsPersona(me.clerkId, { text: '在呢' }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VOICE_UNBOUND' })
    }
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.bodies).toHaveLength(0)
  })

  it('绑的是别人的音色卡：不念', async () => {
    const theirs = await voiceCard(other.id)
    await bindPersona({ voiceCardId: theirs.id })
    await expect(
      speakAsPersona(me.clerkId, { text: '在呢' }),
    ).rejects.toMatchObject({ errorCode: 'VOICE_CARD_UNAVAILABLE' })
    expect(await db.generationJob.count()).toBe(0)
  })
})

describe('listVoiceBenchLines（真库）', () => {
  it('素材库里她这副嗓子念过的音频，旧的在前；别的嗓子、别人的、不是音频的不算', async () => {
    const voice = await voiceCard(me.id)
    const card = await bindPersona({ voiceCardId: voice.id })
    const audio = (
      userId: string,
      voiceId: string,
      prompt: string,
      createdAt: Date,
      outputType: 'AUDIO' | 'IMAGE' = 'AUDIO',
    ) =>
      seedGeneration(userId, {
        outputType,
        prompt,
        snapshot: { voiceId },
        createdAt,
      })
    const g1 = await audio(
      me.id,
      'fish-1',
      '欢迎来到图书馆。',
      new Date('2026-10-26T10:00:00Z'),
    )
    const g2 = await audio(
      me.id,
      'fish-1',
      '[pause] 请保持安静哦。',
      new Date('2026-10-26T10:01:00Z'),
    )
    await audio(me.id, 'fish-2', '别的嗓子', new Date('2026-10-26T10:02:00Z'))
    await audio(other.id, 'fish-1', '别人的', new Date('2026-10-26T10:03:00Z'))
    await audio(
      me.id,
      'fish-1',
      '图',
      new Date('2026-10-26T10:04:00Z'),
      'IMAGE',
    )

    const data = await listVoiceBenchLines(me.clerkId)
    expect(data).toMatchObject({
      characterCardId: card!.id,
      voiceCardId: voice.id,
    })
    expect(data.lines.map((line) => [line.id, line.text])).toEqual([
      [g1.id, '欢迎来到图书馆。'],
      [g2.id, '[pause] 请保持安静哦。'],
    ])
  })

  it('默认助手 / 没绑嗓子：空台', async () => {
    await bindPersona(null)
    expect(await listVoiceBenchLines(me.clerkId)).toEqual({
      characterCardId: null,
      voiceCardId: null,
      lines: [],
    })
    const card = await bindPersona({ voiceCardId: null })
    expect(await listVoiceBenchLines(me.clerkId)).toEqual({
      characterCardId: card!.id,
      voiceCardId: null,
      lines: [],
    })
  })
})
