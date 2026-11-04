/**
 * L2a 真库：「用这段」转存平台音色示例（voice-sample.service）。用户走真库、平台 key 走真 env
 * 读取（测试里设假值）、Fish 音色查询走真服务；只假 Fish 网络（fetch）与 R2。
 * 核返回地址、发给 Fish 的请求、存进 R2 的键。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const r2 = vi.hoisted(() => ({
  objects: new Set<string>(),
  copies: [] as Array<{ sourceUrl: string; key: string }>,
}))
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  getR2PublicUrl: (key: string) => `https://cdn.test/${key}`,
  r2ObjectExists: async (key: string) => r2.objects.has(key),
  uploadFromHttpToR2: async ({
    sourceUrl,
    key,
  }: {
    sourceUrl: string
    key: string
  }) => {
    r2.copies.push({ sourceUrl, key })
    r2.objects.add(key)
    return { publicUrl: `https://cdn.test/${key}`, mimeType: 'audio/mpeg' }
  },
}))

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { importVoiceSample } from '@/services/voice-sample.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

const FISH = AI_PROVIDER_ENDPOINTS.FISH_AUDIO
const SIGNED = 'https://acc.r2.cloudflarestorage.com/a.mp3?X-Amz-Expires=3600'
const fish = vi.hoisted(() => ({
  samples: [] as Array<{ title: null; text: null; audio: string }>,
  calls: [] as Array<{ url: string; auth: string | null }>,
}))

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  r2.objects.clear()
  r2.copies = []
  fish.samples = []
  fish.calls = []
  vi.stubEnv('FISH_AUDIO_VOICE_LIBRARY_API_KEY', 'test-fish-library-key')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(FISH)) return new Response('nope', { status: 404 })
      fish.calls.push({
        url,
        auth: new Headers(init?.headers).get('Authorization'),
      })
      return Response.json({
        _id: 'v1',
        title: 'Voice',
        state: 'trained',
        languages: ['en'],
        visibility: 'public',
        samples: fish.samples,
      })
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const keyOf = (userId: string) =>
  `generations/${userId}/audio/voice-sample_v1.mp3`

describe('importVoiceSample（真库，假 Fish / R2）', () => {
  it('没存过：用平台 key 向 Fish 现问，取第一段有音频的示例存进这位用户的键；第二次直接给地址', async () => {
    fish.samples = [
      { title: null, text: null, audio: '' },
      { title: null, text: null, audio: SIGNED },
    ]
    expect(await importVoiceSample(me.clerkId, 'v1')).toEqual({
      url: `https://cdn.test/${keyOf(me.id)}`,
    })
    expect(fish.calls).toEqual([
      { url: `${FISH}/model/v1`, auth: 'Bearer test-fish-library-key' },
    ])
    expect(r2.copies).toEqual([{ sourceUrl: SIGNED, key: keyOf(me.id) }])

    expect(await importVoiceSample(me.clerkId, 'v1')).toEqual({
      url: `https://cdn.test/${keyOf(me.id)}`,
    })
    expect(fish.calls).toHaveLength(1)
    expect(r2.copies).toHaveLength(1)
  })

  it('一段示例都没有：404，不存空文件', async () => {
    await expect(importVoiceSample(me.clerkId, 'v1')).rejects.toMatchObject({
      httpStatus: 404,
    })
    expect(r2.copies).toHaveLength(0)
  })

  it('平台音色库没配 key：503，不问 Fish', async () => {
    vi.stubEnv('FISH_AUDIO_VOICE_LIBRARY_API_KEY', undefined)
    await expect(importVoiceSample(me.clerkId, 'v1')).rejects.toMatchObject({
      httpStatus: 503,
    })
    expect(fish.calls).toHaveLength(0)
  })
})
