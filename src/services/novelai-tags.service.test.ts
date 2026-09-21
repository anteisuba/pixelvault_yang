import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
}))
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { NovelAiTagQuerySchema } from '@/types/novelai-tags'
import { suggestNovelAiTags } from './novelai-tags.service'

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
