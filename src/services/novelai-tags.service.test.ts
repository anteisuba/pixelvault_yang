import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
}))
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { NovelAiTagQuerySchema } from '@/types/novelai-tags'
import {
  checkNovelAiPromptTags,
  suggestNovelAiTags,
} from './novelai-tags.service'

const query = NovelAiTagQuerySchema.parse({
  model: 'nai-diffusion-5-curated',
  prompt: 'denia',
})
const fetchMock = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(ensureUser).mockResolvedValue({ id: 'user-1' } as Awaited<
    ReturnType<typeof ensureUser>
  >)
  vi.mocked(findActiveKeyForAdapter).mockResolvedValue({
    keyValue: 'test-secret',
  } as NonNullable<Awaited<ReturnType<typeof findActiveKeyForAdapter>>>)
})
afterEach(() => vi.unstubAllGlobals())
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
    expect(await suggestNovelAiTags('clerk-1', query)).toEqual(data)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url.origin).toBe('https://image.novelai.net')
    expect(url.searchParams.get('model')).toBe(query.model)
    expect(url.searchParams.get('prompt')).toBe('denia')
    expect(init.headers.Authorization).toBe('Bearer test-secret')
    expect(init.redirect).toBe('error')
    expect(JSON.stringify(data)).not.toContain('test-secret')
  })
  it('does not call the provider without the user key', async () => {
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    await expect(suggestNovelAiTags('clerk-1', query)).rejects.toMatchObject({
      code: 'MISSING_API_KEY',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('does not retry rate limits or expose upstream payloads', async () => {
    fetchMock.mockResolvedValue(
      new Response('private provider error', { status: 429 }),
    )
    await expect(suggestNovelAiTags('clerk-1', query)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      status: 429,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed responses instead of substituting local tags', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ tags: [{ name: 'denia' }] })),
    )
    await expect(suggestNovelAiTags('clerk-1', query)).rejects.toThrow()
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
      userId: 'user-1',
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
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue(null)
    expect(await check('1girl, sakura tree')).toEqual({
      prompt: '1girl, sakura tree',
      fixes: [],
      unknown: [],
    })
    vi.mocked(findActiveKeyForAdapter).mockResolvedValue({
      keyValue: 'test-secret',
    } as NonNullable<Awaited<ReturnType<typeof findActiveKeyForAdapter>>>)
    fetchMock.mockResolvedValue(new Response('down', { status: 502 }))
    expect((await check('1girl, sakura tree')).unknown).toEqual([])
  })
})
