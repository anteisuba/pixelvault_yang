import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/services/novelai-tags.service', () => ({
  suggestNovelAiTags: vi.fn(),
  NovelAiTagsError: class extends Error {},
}))
import { auth } from '@clerk/nextjs/server'
import { suggestNovelAiTags } from '@/services/novelai-tags.service'
import { GET } from './route'
const request = (query = 'model=nai-diffusion-5-curated&prompt=denia') =>
  new NextRequest(`http://localhost/api/novelai/tag-suggestions?${query}`)
beforeEach(() => vi.resetAllMocks())
describe('official tag route boundary', () => {
  it('requires authentication before calling the provider', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    expect((await GET(request())).status).toBe(401)
    expect(suggestNovelAiTags).not.toHaveBeenCalled()
  })
  it('rejects an unsupported model before calling the provider', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk-1' } as Awaited<
      ReturnType<typeof auth>
    >)
    expect((await GET(request('model=arbitrary&prompt=denia'))).status).toBe(
      400,
    )
    expect(suggestNovelAiTags).not.toHaveBeenCalled()
  })
  it('returns only validated service data with private cache policy', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk-1' } as Awaited<
      ReturnType<typeof auth>
    >)
    vi.mocked(suggestNovelAiTags).mockResolvedValue({
      tags: [{ tag: 'denia (wuthering waves)' }],
    })
    const response = await GET(request())
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      success: true,
      data: { tags: [{ tag: 'denia (wuthering waves)' }] },
    })
  })
})
