/**
 * L2a 真库：NovelAI 官方标签联想与写入前核对（novelai-tags.service）。key 存在真库里（真加密），
 * 只假 NovelAI（fetch）。核发给 NovelAI 的请求与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { NovelAiTagQuerySchema } from '@/types/novelai-tags'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  checkNovelAiPromptTags,
  suggestNovelAiTags,
} from './novelai-tags.service'

const KEY = 'sk-test-not-a-real-key'
const query = NovelAiTagQuerySchema.parse({
  model: 'nai-diffusion-5-curated',
  prompt: 'denia',
})
const fetchMock = vi.fn()
let me: Awaited<ReturnType<typeof createTestUser>>
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  await resetDatabase()
  me = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.NOVELAI)
})
afterEach(() => vi.unstubAllGlobals())
const dropKeys = () => db.userApiKey.deleteMany({ where: { userId: me.id } })
describe('NovelAI official tag suggestions', () => {
  it('queries the selected model with a server-side key and preserves official tags and order', async () => {
    const data = {
      tags: [
        {
          tag: 'denia (breakdown) (wuthering waves)',
          count: 10000,
          confidence: 0,
        },
        { tag: 'denia (wuthering waves)', count: 10000, confidence: 0 },
      ],
    }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(data)))
    expect(await suggestNovelAiTags(me.clerkId, query)).toEqual(data)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url.origin).toBe('https://image.novelai.net')
    expect(url.searchParams.get('model')).toBe(query.model)
    expect(url.searchParams.get('prompt')).toBe('denia')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.redirect).toBe('error')
    expect(JSON.stringify(data)).not.toContain(KEY)
  })
  it('does not call the provider without the user key', async () => {
    await dropKeys()
    await expect(suggestNovelAiTags(me.clerkId, query)).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not retry rate limits or expose upstream payloads', async () => {
    fetchMock.mockResolvedValue(
      new Response('private provider error', { status: 429 }),
    )
    await expect(suggestNovelAiTags(me.clerkId, query)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      status: 429,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed responses instead of substituting local tags', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ tags: [{ name: 'denia' }] })),
    )
    await expect(suggestNovelAiTags(me.clerkId, query)).rejects.toThrow()
  })
  it('rejects unsupported models and unbounded prompts', () => {
    expect(
      NovelAiTagQuerySchema.safeParse({ ...query, model: 'gpt-image-1' })
        .success,
    ).toBe(false)
    expect(
      NovelAiTagQuerySchema.safeParse({ ...query, prompt: 'a'.repeat(201) })
        .success,
    ).toBe(false)
  })
})

describe('NovelAI tag check before the assistant writes (拆分与反推 B3)', () => {
  const suggest = (tags: string[]) =>
    new Response(JSON.stringify({ tags: tags.map((tag) => ({ tag })) }))
  const check = (prompt: string) =>
    checkNovelAiPromptTags({
      userId: me.id,
      modelId: 'nai-diffusion-5-full',
      prompt,
    })

  it('dictionary tags need no lookup; aliases are rewritten to the real tag', async () => {
    const result = await check('1girl, black hair, cherry blossom, serafuku')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      prompt: '1girl, black hair, cherry blossoms, serafuku',
      fixes: [{ from: 'cherry blossom', to: 'cherry blossoms' }],
      unknown: [],
    })
  })

  it('asks NovelAI for the rest: close spelling is fixed, nothing close is kept and reported', async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      url.searchParams.get('prompt') === 'pleated skirts'
        ? suggest(['pleated skirt', 'pleated dress'])
        : suggest(['sakura (flower)']),
    )
    const result = await check('1girl, {pleated skirts}, sakura tree')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      prompt: '1girl, {pleated skirt}, sakura tree',
      fixes: [{ from: 'pleated skirts', to: 'pleated skirt' }],
      unknown: ['sakura tree'],
    })
  })

  it('draws no conclusion when it cannot look a tag up (no key / upstream error)', async () => {
    await dropKeys()
    expect(await check('1girl, sakura tree')).toEqual({
      prompt: '1girl, sakura tree',
      fixes: [],
      unknown: [],
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.NOVELAI)
    fetchMock.mockResolvedValue(new Response('down', { status: 502 }))
    expect((await check('1girl, sakura tree')).unknown).toEqual([])
  })
})
