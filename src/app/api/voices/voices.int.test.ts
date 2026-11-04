/**
 * L2a 真库：声音那几条接口——音色卡增删改查（/api/voice-cards 与 /[id]）、Fish Audio 音色库
 * （/api/voices 列 / 克隆、/[id] 读 / 删）、转写（transcribe）、上传参考音频（upload-reference）。
 * 只假边界：Clerk 登录、限流开关、R2、Fish Audio（fetch）。用户的 Fish key 真加密入库、服务真解密；
 * 核库里的行、发给 Fish 的请求（用哪把 key、带了什么）与返回值。
 */
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const uploaded = vi.hoisted(
  () => [] as Array<{ key: string; mimeType: string }>,
)
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  uploadToR2: vi.fn(
    async ({ key, mimeType }: { key: string; mimeType: string }) => {
      uploaded.push({ key, mimeType })
      return `https://cdn.test/${key}`
    },
  ),
}))

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { REFERENCE_AUDIO_MAX_BYTES } from '@/constants/audio-options'
import {
  VOICE_API_ERROR_CODES,
  VOICE_CARD_DEFAULT_PACE,
} from '@/constants/voice-cards'
import {
  GET as LIST_CARDS,
  POST as CREATE_CARD,
} from '@/app/api/voice-cards/route'
import {
  DELETE as DELETE_CARD,
  GET as GET_CARD,
  PATCH as PATCH_CARD,
} from '@/app/api/voice-cards/[id]/route'
import { GET as LIST_VOICES, POST as CLONE_VOICE } from '@/app/api/voices/route'
import {
  DELETE as DELETE_VOICE,
  GET as GET_VOICE,
} from '@/app/api/voices/[id]/route'
import { POST as TRANSCRIBE } from '@/app/api/voices/transcribe/route'
import { POST as UPLOAD_REFERENCE } from '@/app/api/voices/upload-reference/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

const FISH = AI_PROVIDER_ENDPOINTS.FISH_AUDIO
const LIBRARY_KEY = 'fish-library-key-test'
/** `seedAssistantKey` 落的那把（真加密）；服务解出来应是这一串。 */
const USER_KEY = 'sk-test-not-a-real-key'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function rawVoice(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    title: `Voice ${id}`,
    state: 'trained',
    languages: ['en'],
    samples: [],
    visibility: 'public',
    ...overrides,
  }
}

/** 假 Fish Audio：按「方法 + 路径」应答，记下每次请求用的 key 与正文。 */
type FishCall = {
  method: string
  path: string
  auth: string | null
  body?: FormData
}
const fish = {
  calls: [] as FishCall[],
  voices: new Map<string, Record<string, unknown>>(),
  created: rawVoice('cloned_1', {
    title: 'Narrator',
    visibility: 'private',
    samples: [{ text: 'from fish', audio: 'samples/cloned_1.mp3' }],
  }),
}
function stubFish() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input))
      if (!url.href.startsWith(FISH))
        throw new Error(`unexpected fetch ${url.href}`)
      const path = url.href.slice(FISH.length).split('?')[0]!
      const method = init.method ?? 'GET'
      const headers = new Headers(init.headers)
      fish.calls.push({
        method,
        path: `${path}${url.search}`,
        auth: headers.get('authorization'),
        body: init.body instanceof FormData ? init.body : undefined,
      })
      const voiceMatch = /^\/model\/([^/]+)$/.exec(path)
      if (method === 'GET' && path === '/model') {
        const items = [...fish.voices.values()]
        return Response.json({ total: items.length, items })
      }
      if (method === 'GET' && voiceMatch) {
        const voice = fish.voices.get(decodeURIComponent(voiceMatch[1]!))
        return voice
          ? Response.json(voice)
          : new Response('not found', { status: 404 })
      }
      if (method === 'DELETE' && voiceMatch) {
        fish.voices.delete(decodeURIComponent(voiceMatch[1]!))
        return new Response(null, { status: 200 })
      }
      if (method === 'POST' && path === '/model')
        return Response.json(fish.created)
      if (method === 'POST' && path === '/v1/asr') {
        return Response.json({ text: 'Hello world', duration: 1.2 })
      }
      return new Response('no route', { status: 404 })
    }),
  )
}

const previousLibraryKey = process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  fish.calls.length = 0
  fish.voices.clear()
  uploaded.length = 0
  vi.unstubAllGlobals()
  stubFish()
  mockRateLimitAllowed()
  process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY = LIBRARY_KEY
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (previousLibraryKey === undefined)
    delete process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY
  else process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY = previousLibraryKey
})

const giveMeAFishKey = () =>
  seedAssistantKey(me.id, AI_ADAPTER_TYPES.FISH_AUDIO)

function multipart(
  path: string,
  form: FormData,
  headers?: Record<string, string>,
) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method: 'POST',
    body: form,
    headers,
  })
}
const audioFile = (
  name = 'voice.mp3',
  type = 'audio/mpeg',
  body: BlobPart = 'audio',
) => new File([body], name, { type })

// ─── 音色卡 ─────────────────────────────────────────────────────────

describe('/api/voice-cards（真库）', () => {
  type Card = { id: string; name: string; pace: string; voiceId: string | null }

  async function seedCard(userId: string, name: string) {
    return db.voiceCard.create({ data: { userId, name } })
  }

  it('没登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect(
      (await CREATE_CARD(createPOST('/api/voice-cards', { name: 'N' }))).status,
    ).toBe(401)
    expect((await LIST_CARDS(createGET('/api/voice-cards'))).status).toBe(401)
    expect(await db.voiceCard.count()).toBe(0)
  })

  it('建一张：201，按默认语速落库、属于我；空名字 400 不落库', async () => {
    expect(
      (await CREATE_CARD(createPOST('/api/voice-cards', { name: '' }))).status,
    ).toBe(400)
    const res = await CREATE_CARD(
      createPOST('/api/voice-cards', { name: 'Narrator' }),
    )
    expect(res.status).toBe(201)
    const card = (await parseJSON<Envelope<Card>>(res)).data!
    expect(
      await db.voiceCard.findUniqueOrThrow({ where: { id: card.id } }),
    ).toMatchObject({
      userId: me.id,
      name: 'Narrator',
      provider: 'fish_audio',
      pace: VOICE_CARD_DEFAULT_PACE,
    })
    expect(await db.voiceCard.count()).toBe(1)
    expect(fish.calls).toEqual([])
  })

  it('带 voiceId 建：拿平台 key 去 Fish 核这副嗓子；Fish 查无此音 400 不落库', async () => {
    fish.voices.set('voice_ok', rawVoice('voice_ok'))
    const ok = await CREATE_CARD(
      createPOST('/api/voice-cards', { name: 'N', voiceId: 'voice_ok' }),
    )
    expect(ok.status).toBe(201)
    expect(fish.calls).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/model/voice_ok',
        auth: `Bearer ${LIBRARY_KEY}`,
      }),
    ])

    const missing = await CREATE_CARD(
      createPOST('/api/voice-cards', { name: 'N', voiceId: 'voice_gone' }),
    )
    expect(missing.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(missing)).errorCode).toBe(
      'VOICE_NOT_FOUND',
    )
    expect(await db.voiceCard.count()).toBe(1)
  })

  it('列表只列我的、分页；页码非法 400', async () => {
    await seedCard(me.id, 'A')
    await seedCard(me.id, 'B')
    await seedCard(other.id, '别人的')
    const page = await parseJSON<Envelope<{ items: Card[]; total: number }>>(
      await LIST_CARDS(
        createGET('/api/voice-cards', { page: '1', pageSize: '1' }),
      ),
    )
    expect(page.data!.total).toBe(2)
    expect(page.data!.items).toHaveLength(1)
    expect(
      (await LIST_CARDS(createGET('/api/voice-cards', { page: '0' }))).status,
    ).toBe(400)
  })

  it('读 / 改 / 删我的；别人的一律 404 不动', async () => {
    const mine = await seedCard(me.id, 'Old')
    const theirs = await seedCard(other.id, 'Theirs')

    const got = await parseJSON<Envelope<Card>>(
      await GET_CARD(createGET(`/api/voice-cards/${mine.id}`), params(mine.id)),
    )
    expect(got.data!.name).toBe('Old')

    expect(
      (
        await PATCH_CARD(
          createPATCH(`/api/voice-cards/${mine.id}`, { pace: 'too-fast' }),
          params(mine.id),
        )
      ).status,
    ).toBe(400)
    const patched = await PATCH_CARD(
      createPATCH(`/api/voice-cards/${mine.id}`, { name: 'Updated' }),
      params(mine.id),
    )
    expect((await parseJSON<Envelope<Card>>(patched)).data!.name).toBe(
      'Updated',
    )
    expect(
      (await db.voiceCard.findUniqueOrThrow({ where: { id: mine.id } })).name,
    ).toBe('Updated')

    for (const res of [
      await GET_CARD(
        createGET(`/api/voice-cards/${theirs.id}`),
        params(theirs.id),
      ),
      await PATCH_CARD(
        createPATCH(`/api/voice-cards/${theirs.id}`, { name: 'x' }),
        params(theirs.id),
      ),
      await DELETE_CARD(
        createDELETE(`/api/voice-cards/${theirs.id}`),
        params(theirs.id),
      ),
    ]) {
      expect(res.status).toBe(404)
    }
    expect(
      await db.voiceCard.findUniqueOrThrow({ where: { id: theirs.id } }),
    ).toMatchObject({
      name: 'Theirs',
      isDeleted: false,
    })
  })

  it('删：软删，并松开绑着它的角色', async () => {
    const card = await seedCard(me.id, 'N')
    const character = await db.characterCard.create({
      data: { userId: me.id, name: 'Mira', voiceCardId: card.id },
    })
    expect(
      (
        await DELETE_CARD(
          createDELETE(`/api/voice-cards/${card.id}`),
          params(card.id),
        )
      ).status,
    ).toBe(200)
    expect(
      (await db.voiceCard.findUniqueOrThrow({ where: { id: card.id } }))
        .isDeleted,
    ).toBe(true)
    expect(
      (
        await db.characterCard.findUniqueOrThrow({
          where: { id: character.id },
        })
      ).voiceCardId,
    ).toBeNull()
    expect(
      (
        await GET_CARD(
          createGET(`/api/voice-cards/${card.id}`),
          params(card.id),
        )
      ).status,
    ).toBe(404)
  })
})

// ─── Fish Audio 音色库 ───────────────────────────────────────────────

describe('GET /api/voices（真库 + 假 Fish）', () => {
  it('公开库：不要登录、不要用户 key，用平台 key 带着筛选去问', async () => {
    mockUnauthenticated()
    fish.voices.set(
      'voice_pub',
      rawVoice('voice_pub', { cover_image: 'covers/a.png' }),
    )
    const res = await LIST_VOICES(
      createGET('/api/voices', {
        page: '2',
        pageSize: '10',
        search: 'calm',
        language: 'en',
      }),
    )
    const body = await parseJSON<
      Envelope<{
        total: number
        items: Array<{ id: string; coverImage: string }>
      }>
    >(res)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
    expect(body.data!.items[0]).toMatchObject({
      id: 'voice_pub',
      coverImage: `${AI_PROVIDER_ENDPOINTS.FISH_AUDIO_ASSETS}/covers/a.png`,
    })
    expect(fish.calls).toEqual([
      expect.objectContaining({
        auth: `Bearer ${LIBRARY_KEY}`,
        path: '/model?page_size=10&page_number=2&title=calm&language=en',
      }),
    ])
  })

  it('公开库：没配平台 key 503；被限流 429；参数非法 400；都不问 Fish', async () => {
    delete process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY
    const missing = await LIST_VOICES(createGET('/api/voices'))
    expect(missing.status).toBe(503)
    expect((await parseJSON<Envelope<unknown>>(missing)).errorCode).toBe(
      VOICE_API_ERROR_CODES.PUBLIC_LIBRARY_UNAVAILABLE,
    )
    process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY = LIBRARY_KEY
    mockRateLimitExceeded()
    expect((await LIST_VOICES(createGET('/api/voices'))).status).toBe(429)
    mockRateLimitAllowed()
    expect(
      (await LIST_VOICES(createGET('/api/voices', { pageSize: '999' }))).status,
    ).toBe(400)
    expect(fish.calls).toEqual([])
  })

  it('我的克隆：要登录、要我自己的 Fish key，用我的 key 带 self=true', async () => {
    mockUnauthenticated()
    expect(
      (await LIST_VOICES(createGET('/api/voices', { self: 'true' }))).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    const noKey = await LIST_VOICES(createGET('/api/voices', { self: 'true' }))
    expect(noKey.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(noKey)).errorCode).toBe(
      VOICE_API_ERROR_CODES.MISSING_API_KEY,
    )
    expect(fish.calls).toEqual([])

    await giveMeAFishKey()
    const res = await LIST_VOICES(createGET('/api/voices', { self: 'true' }))
    expect(res.status).toBe(200)
    expect(fish.calls).toEqual([
      expect.objectContaining({
        auth: `Bearer ${USER_KEY}`,
        path: '/model?page_size=20&page_number=1&self=true',
      }),
    ])
  })
})

describe('POST /api/voices 克隆（真库 + 假 Fish）', () => {
  const clone = (form: FormData) => CLONE_VOICE(multipart('/api/voices', form))
  const titled = () => {
    const form = new FormData()
    form.append('title', 'Narrator')
    return form
  }

  it('没登录 401；没有 Fish key 400；都不问 Fish、不落卡', async () => {
    const form = titled()
    form.append('voices', audioFile())
    mockUnauthenticated()
    expect((await clone(form)).status).toBe(401)
    mockAuthenticated(me.clerkId)
    expect((await clone(form)).status).toBe(400)
    expect(fish.calls).toEqual([])
    expect(await db.voiceCard.count()).toBe(0)
  })

  it('上传不合格的一律拒，不问 Fish', async () => {
    await giveMeAFishKey()
    const noTitle = new FormData()
    noTitle.append('voices', audioFile())
    expect((await clone(noTitle)).status).toBe(400)

    expect((await clone(titled())).status).toBe(400)

    const tooMany = titled()
    for (let i = 0; i < 9; i += 1)
      tooMany.append('voices', audioFile(`v${i}.mp3`))
    const many = await clone(tooMany)
    expect(many.status).toBe(413)
    expect((await parseJSON<Envelope<unknown>>(many)).errorCode).toBe(
      'TOO_MANY_VOICE_FILES',
    )

    for (const file of [
      audioFile('v.txt', 'text/plain'),
      audioFile('v.bin', 'audio/x-unknown'),
    ]) {
      const form = titled()
      form.append('voices', file)
      const res = await clone(form)
      expect(res.status).toBe(400)
      expect((await parseJSON<Envelope<unknown>>(res)).errorCode).toBe(
        'UNSUPPORTED_VOICE_FILE_TYPE',
      )
    }

    const big = titled()
    big.append(
      'voices',
      audioFile('v.wav', 'audio/wav', new Uint8Array(10 * 1024 * 1024 + 1)),
    )
    const bigRes = await clone(big)
    expect(bigRes.status).toBe(413)
    expect((await parseJSON<Envelope<unknown>>(bigRes)).errorCode).toBe(
      'VOICE_FILE_TOO_LARGE',
    )

    expect(fish.calls).toEqual([])
    expect(await db.voiceCard.count()).toBe(0)
  })

  it('用我的 key 克隆一副私有嗓子，并落一张克隆卡（示例文本取我递的那句）', async () => {
    await giveMeAFishKey()
    const form = titled()
    form.append('description', 'Clean narration voice')
    form.append('texts', 'sample transcript')
    form.append('enhance_audio_quality', 'true')
    form.append('voices', audioFile())

    const res = await clone(form)
    expect(res.status).toBe(201)
    const body = await parseJSON<
      Envelope<{ id: string }> & { voiceCard: { id: string } }
    >(res)
    expect(body.data!.id).toBe('cloned_1')

    const call = fish.calls.find((c) => c.method === 'POST')!
    expect(call.auth).toBe(`Bearer ${USER_KEY}`)
    expect(
      Object.fromEntries(
        [
          'title',
          'visibility',
          'description',
          'enhance_audio_quality',
          'texts',
        ].map((k) => [k, call.body!.get(k)]),
      ),
    ).toEqual({
      title: 'Narrator',
      visibility: 'private',
      description: 'Clean narration voice',
      enhance_audio_quality: 'true',
      texts: 'sample transcript',
    })
    expect(call.body!.getAll('voices')).toHaveLength(1)

    expect(
      await db.voiceCard.findUniqueOrThrow({
        where: { id: body.voiceCard.id },
      }),
    ).toMatchObject({
      userId: me.id,
      name: 'Narrator',
      voiceId: 'cloned_1',
      referenceAudioUrl: `${AI_PROVIDER_ENDPOINTS.FISH_AUDIO_ASSETS}/samples/cloned_1.mp3`,
      sampleText: 'sample transcript',
    })
  })
})

describe('/api/voices/[id]（假 Fish）', () => {
  it('读公开音色：id 不像音色 id 400、被限流 429、没平台 key 503，都不问 Fish', async () => {
    mockUnauthenticated()
    expect(
      (await GET_VOICE(createGET('/api/voices/..%2Fx'), params('../x'))).status,
    ).toBe(400)
    mockRateLimitExceeded()
    expect(
      (await GET_VOICE(createGET('/api/voices/v1'), params('v1'))).status,
    ).toBe(429)
    mockRateLimitAllowed()
    delete process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY
    expect(
      (await GET_VOICE(createGET('/api/voices/v1'), params('v1'))).status,
    ).toBe(503)
    expect(fish.calls).toEqual([])
  })

  it('读公开音色：不要登录，用平台 key 取详情', async () => {
    mockUnauthenticated()
    fish.voices.set('v1', rawVoice('v1', { title: 'Calm' }))
    const res = await GET_VOICE(createGET('/api/voices/v1'), params('v1'))
    expect(
      (await parseJSON<Envelope<{ id: string; title: string }>>(res)).data,
    ).toMatchObject({
      id: 'v1',
      title: 'Calm',
    })
    expect(fish.calls).toEqual([
      expect.objectContaining({
        auth: `Bearer ${LIBRARY_KEY}`,
        path: '/model/v1',
      }),
    ])
  })

  it('删：没登录 401；有 key 时用我的 key 去 Fish 删，204', async () => {
    fish.voices.set('v1', rawVoice('v1'))
    mockUnauthenticated()
    expect(
      (await DELETE_VOICE(createDELETE('/api/voices/v1'), params('v1'))).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    expect(
      (await DELETE_VOICE(createDELETE('/api/voices/v1'), params('v1'))).status,
    ).toBe(400)
    expect(fish.calls).toEqual([])

    await giveMeAFishKey()
    expect(
      (await DELETE_VOICE(createDELETE('/api/voices/v1'), params('v1'))).status,
    ).toBe(204)
    expect(fish.calls).toEqual([
      expect.objectContaining({
        method: 'DELETE',
        path: '/model/v1',
        auth: `Bearer ${USER_KEY}`,
      }),
    ])
    expect(fish.voices.has('v1')).toBe(false)
  })
})

describe('POST /api/voices/transcribe（真库 + 假 Fish）', () => {
  const transcribe = (form: FormData) =>
    TRANSCRIBE(multipart('/api/voices/transcribe', form))
  const withAudio = (file = audioFile()) => {
    const form = new FormData()
    form.append('audio', file)
    return form
  }

  it('没登录 401；没 Fish key 400；都不问 Fish', async () => {
    mockUnauthenticated()
    expect((await transcribe(withAudio())).status).toBe(401)
    mockAuthenticated(me.clerkId)
    const res = await transcribe(withAudio())
    expect(res.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(res)).errorCode).toBe(
      VOICE_API_ERROR_CODES.MISSING_API_KEY,
    )
    expect(fish.calls).toEqual([])
  })

  it('Content-Length 超限 413、不支持的格式 400，都不问 Fish', async () => {
    await giveMeAFishKey()
    const big = await TRANSCRIBE(
      new NextRequest(
        new URL('/api/voices/transcribe', 'http://localhost:3000'),
        {
          method: 'POST',
          body: 'placeholder',
          headers: { 'content-length': String(REFERENCE_AUDIO_MAX_BYTES * 2) },
        },
      ),
    )
    expect(big.status).toBe(413)
    expect((await parseJSON<Envelope<unknown>>(big)).errorCode).toBe(
      'AUDIO_TOO_LARGE',
    )
    const txt = await transcribe(withAudio(audioFile('a.txt', 'text/plain')))
    expect(txt.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(txt)).errorCode).toBe(
      'UNSUPPORTED_AUDIO_TYPE',
    )
    expect(fish.calls).toEqual([])
  })

  it('用我的 key 转写，回文字', async () => {
    await giveMeAFishKey()
    const form = withAudio()
    form.append('ignore_timestamps', 'true')
    const res = await transcribe(form)
    expect(await parseJSON(res)).toEqual({
      success: true,
      data: { text: 'Hello world', duration: 1.2, segments: [] },
    })
    const call = fish.calls.find((c) => c.path === '/v1/asr')!
    expect(call.auth).toBe(`Bearer ${USER_KEY}`)
    expect(call.body!.get('ignore_timestamps')).toBe('true')
  })
})

describe('POST /api/voices/upload-reference（真库 + 假 R2）', () => {
  const upload = (form: FormData, headers?: Record<string, string>) =>
    UPLOAD_REFERENCE(multipart('/api/voices/upload-reference', form, headers))

  it('没登录 401；没文件 400；不支持的格式 400；Content-Length 超限 413；都不上传', async () => {
    const form = new FormData()
    form.append('audio', audioFile())
    mockUnauthenticated()
    expect((await upload(form)).status).toBe(401)
    mockAuthenticated(me.clerkId)

    expect((await upload(new FormData())).status).toBe(400)
    const bad = new FormData()
    bad.append('audio', audioFile('a.txt', 'text/plain'))
    const badRes = await upload(bad)
    expect(badRes.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(badRes)).errorCode).toBe(
      'UNSUPPORTED_AUDIO_TYPE',
    )

    const big = await UPLOAD_REFERENCE(
      new NextRequest(
        new URL('/api/voices/upload-reference', 'http://localhost:3000'),
        {
          method: 'POST',
          body: 'placeholder',
          headers: { 'content-length': String(REFERENCE_AUDIO_MAX_BYTES * 2) },
        },
      ),
    )
    expect(big.status).toBe(413)
    expect(uploaded).toEqual([])
  })

  it('传到我名下的 R2 目录，回地址与文件名', async () => {
    const form = new FormData()
    form.append('audio', audioFile('ref.wav', 'audio/wav'))
    const res = await upload(form)
    const body = await parseJSON<
      Envelope<{
        url: string
        fileName: string
        mimeType: string
        sizeBytes: number
      }>
    >(res)
    expect(body.data).toMatchObject({
      fileName: 'ref.wav',
      mimeType: 'audio/wav',
      sizeBytes: 5,
    })
    expect(uploaded).toEqual([
      {
        key: expect.stringMatching(
          new RegExp(`^audio-references/${me.id}/.+\\.wav$`),
        ),
        mimeType: 'audio/wav',
      },
    ])
    expect(body.data!.url).toBe(`https://cdn.test/${uploaded[0]!.key}`)
  })
})
