/**
 * L2a 真库：声音卡（建 / 克隆 / 列 / 读 / 改 / 删 / 换封面）。
 * key 走真加密、真 apiKey.service；只假 Fish Audio 那一跳（fetch）和 R2（内存桶）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/fake-r2')).fakeR2Module(
    await importOriginal<typeof import('@/services/storage/r2')>(),
  ),
)

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'
import {
  createClonedVoiceCard,
  createVoiceCard,
  deleteVoiceCard,
  getVoiceCard,
  listVoiceCards,
  updateVoiceCard,
  uploadVoiceCardCover,
} from '@/features/cards/services/voice-card.service'
import { db } from '@/lib/db'
import { R2_PUBLIC_BASE, r2Bucket } from '@/test/fake-r2'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import type { CreateVoiceCardRequest } from '@/types'

const VALID_INPUT: CreateVoiceCardRequest = {
  name: 'Narrator',
  provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
  modelId: 'fish-audio-s2-pro',
  voiceId: 'voice_123',
  tone: [],
  pace: VOICE_CARD_DEFAULT_PACE,
  pronunciationDictionary: {},
}

/** Fish Audio 认得的声音 id。 */
let fishVoices: Set<string>
const fetchMock = vi.fn<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
>(async (input) => {
  const url = String(input)
  const match = url.match(/\/model\/([^/?]+)$/)
  if (!match) throw new Error(`不该联网：${url}`)
  const id = decodeURIComponent(match[1]!)
  return fishVoices.has(id)
    ? Response.json({ _id: id, title: 'Narrator' })
    : new Response('not found', { status: 404 })
})

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  fishVoices = new Set(['voice_123'])
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', R2_PUBLIC_BASE)
  r2Bucket.clear()
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FISH_AUDIO)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function seedVoiceCard(
  data: Partial<{ userId: string; name: string; voiceId: string | null }> & {
    coverImage?: string | null
    isDeleted?: boolean
    createdAt?: Date
  } = {},
) {
  return db.voiceCard.create({
    data: {
      userId: me.id,
      name: 'Narrator',
      provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
      modelId: 'fish-audio-s2-pro',
      voiceId: 'voice_123',
      ...data,
    },
  })
}

const voiceRow = (id: string) =>
  db.voiceCard.findUniqueOrThrow({ where: { id } })

describe('createVoiceCard', () => {
  it('先用你的 Fish Audio key 验过这个声音，再建在你名下（带封面）', async () => {
    const result = await createVoiceCard(me.clerkId, {
      ...VALID_INPUT,
      coverImage: 'https://cdn.example.com/cover.png',
    })

    expect(await voiceRow(result.id)).toMatchObject({
      userId: me.id,
      name: 'Narrator',
      provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
      voiceId: 'voice_123',
      coverImage: 'https://cdn.example.com/cover.png',
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/model\/voice_123$/)
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer sk-test-not-a-real-key',
    )
  })

  it('skips Fish Audio validation when voiceId is omitted', async () => {
    await createVoiceCard(me.clerkId, { ...VALID_INPUT, voiceId: undefined })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await db.voiceCard.count()).toBe(1)
  })

  it('fails when Fish Audio voice validation fails', async () => {
    fishVoices.clear()
    await expect(
      createVoiceCard(me.clerkId, VALID_INPUT),
    ).rejects.toMatchObject({ errorCode: 'VOICE_NOT_FOUND', httpStatus: 400 })
    expect(await db.voiceCard.count()).toBe(0)
  })

  it('rejects voiceId for providers without voice library support', async () => {
    await expect(
      createVoiceCard(me.clerkId, {
        ...VALID_INPUT,
        provider: VOICE_CARD_PROVIDER.FAL_F5TTS,
        voiceId: 'bogus-id',
      }),
    ).rejects.toThrow(/supported voice providers/i)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await db.voiceCard.count()).toBe(0)
  })
})

describe('createClonedVoiceCard', () => {
  it('creates a local Fish Audio S2 Pro card without remote validation', async () => {
    const result = await createClonedVoiceCard(me.clerkId, {
      name: 'Cloned Narrator',
      voiceId: 'voice_cloned_123',
      referenceAudioUrl: 'https://cdn.example.com/sample.mp3',
      sampleText: 'sample transcript',
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(await voiceRow(result.id)).toMatchObject({
      userId: me.id,
      name: 'Cloned Narrator',
      provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
      modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: 'voice_cloned_123',
      referenceAudioUrl: 'https://cdn.example.com/sample.mp3',
      sampleText: 'sample transcript',
    })
  })
})

describe('listVoiceCards / getVoiceCard', () => {
  it('分页、新的在前；只算自己没删的', async () => {
    for (let i = 0; i < 3; i += 1)
      await seedVoiceCard({
        name: `v${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      })
    await seedVoiceCard({ name: 'gone', isDeleted: true })
    await seedVoiceCard({ name: 'theirs', userId: other.id })

    const page2 = await listVoiceCards(me.clerkId, 2, 2)

    expect(page2.total).toBe(3)
    expect(page2.items.map((card) => card.name)).toEqual(['v0'])
  })

  it('读：只回自己没删的', async () => {
    const mine = await seedVoiceCard()
    const gone = await seedVoiceCard({ isDeleted: true })
    const theirs = await seedVoiceCard({ userId: other.id })

    await expect(getVoiceCard(me.clerkId, mine.id)).resolves.toMatchObject({
      id: mine.id,
    })
    await expect(getVoiceCard(me.clerkId, gone.id)).resolves.toBeNull()
    await expect(getVoiceCard(me.clerkId, theirs.id)).resolves.toBeNull()
  })
})

describe('updateVoiceCard', () => {
  it('updates an owned voice card', async () => {
    const card = await seedVoiceCard()
    const result = await updateVoiceCard(me.clerkId, card.id, {
      name: 'Updated',
      pace: 'fast',
    })
    expect(result.name).toBe('Updated')
    expect(await voiceRow(card.id)).toMatchObject({
      name: 'Updated',
      pace: 'fast',
    })
  })

  it('throws not found when updating a missing or foreign card', async () => {
    const theirs = await seedVoiceCard({ userId: other.id })
    for (const id of ['missing', theirs.id]) {
      await expect(
        updateVoiceCard(me.clerkId, id, { name: 'Updated' }),
      ).rejects.toMatchObject({
        errorCode: 'VOICE_CARD_NOT_FOUND',
        httpStatus: 404,
      })
    }
    expect((await voiceRow(theirs.id)).name).toBe('Narrator')
  })

  it('rejects changing provider to one without voice library support while voiceId exists', async () => {
    const card = await seedVoiceCard()
    await expect(
      updateVoiceCard(me.clerkId, card.id, {
        provider: VOICE_CARD_PROVIDER.FAL_F5TTS,
      }),
    ).rejects.toThrow(/supported voice providers/i)
    expect((await voiceRow(card.id)).provider).toBe(
      VOICE_CARD_PROVIDER.FISH_AUDIO,
    )
  })
})

describe('deleteVoiceCard', () => {
  it('软删，并把用它的角色解绑', async () => {
    const card = await seedVoiceCard()
    const character = await createTestCard(me.id, { voiceCardId: card.id })

    await deleteVoiceCard(me.clerkId, card.id)

    expect((await voiceRow(card.id)).isDeleted).toBe(true)
    expect(
      (
        await db.characterCard.findUniqueOrThrow({
          where: { id: character.id },
        })
      ).voiceCardId,
    ).toBeNull()
  })

  it('throws not found when no row is updated', async () => {
    const theirs = await seedVoiceCard({ userId: other.id })
    for (const id of ['missing', theirs.id]) {
      await expect(deleteVoiceCard(me.clerkId, id)).rejects.toMatchObject({
        errorCode: 'VOICE_CARD_NOT_FOUND',
        httpStatus: 404,
      })
    }
    expect((await voiceRow(theirs.id)).isDeleted).toBe(false)
  })
})

describe('uploadVoiceCardCover', () => {
  const PNG = `data:image/png;base64,${Buffer.from('img').toString('base64')}`
  const prefix = () => `profiles/${me.id}/voice-cover/`

  it('uploads under the voice-cover prefix and writes coverImage', async () => {
    const card = await seedVoiceCard()

    await uploadVoiceCardCover(me.clerkId, card.id, PNG)

    const [key] = [...r2Bucket.keys()]
    expect(key!.startsWith(`${prefix()}${card.id}_`)).toBe(true)
    expect(key!.endsWith('.png')).toBe(true)
    expect((await voiceRow(card.id)).coverImage).toBe(
      `${R2_PUBLIC_BASE}/${key}`,
    )
  })

  it('deletes only a previous cover this route uploaded', async () => {
    const oldKey = `${prefix()}old.png`
    r2Bucket.set(oldKey, { data: Buffer.from('o'), mimeType: 'image/png' })
    r2Bucket.set('generations/abc.png', {
      data: Buffer.from('g'),
      mimeType: 'image/png',
    })
    const ownCover = await seedVoiceCard({
      coverImage: `${R2_PUBLIC_BASE}/${oldKey}`,
    })
    const galleryCover = await seedVoiceCard({
      coverImage: `${R2_PUBLIC_BASE}/generations/abc.png`,
    })

    await uploadVoiceCardCover(me.clerkId, ownCover.id, PNG)
    await uploadVoiceCardCover(me.clerkId, galleryCover.id, PNG)

    expect(r2Bucket.has(oldKey)).toBe(false)
    expect(r2Bucket.has('generations/abc.png')).toBe(true)
  })

  it('rejects unsupported image types', async () => {
    const card = await seedVoiceCard()
    await expect(
      uploadVoiceCardCover(
        me.clerkId,
        card.id,
        `data:image/gif;base64,${Buffer.from('gif').toString('base64')}`,
      ),
    ).rejects.toMatchObject({ errorCode: 'UNSUPPORTED_IMAGE_TYPE' })
    expect(r2Bucket.size).toBe(0)
  })

  it('throws not found for a card that is not yours', async () => {
    const theirs = await seedVoiceCard({ userId: other.id })
    await expect(
      uploadVoiceCardCover(me.clerkId, theirs.id, PNG),
    ).rejects.toMatchObject({ errorCode: 'VOICE_CARD_NOT_FOUND' })
  })
})
