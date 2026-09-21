import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruCatalog: vi.fn(),
}))
import { auth } from '@clerk/nextjs/server'
import { fetchDanbooruCatalog } from '@/services/research/danbooru.connector'
import { GET } from './route'
const request = (query = 'query=denia&kind=character') =>
  new NextRequest(`http://localhost/api/danbooru/catalog?${query}`)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as Awaited<
    ReturnType<typeof auth>
  >)
  vi.mocked(fetchDanbooruCatalog).mockResolvedValue({
    candidates: [],
    detail: null,
  })
})
describe('catalog API boundary', () => {
  it('rejects anonymous requests before contacting Danbooru', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    expect((await GET(request())).status).toBe(401)
    expect(fetchDanbooruCatalog).not.toHaveBeenCalled()
  })
  it('rejects arbitrary metatag injection in selected tags', async () => {
    expect(
      (await GET(request('query=denia&kind=character&tag=denia%20rating:e')))
        .status,
    ).toBe(400)
    expect(fetchDanbooruCatalog).not.toHaveBeenCalled()
  })
  it('delegates validated queries and keeps responses private', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(fetchDanbooruCatalog).toHaveBeenCalledWith({
      query: 'denia',
      kind: 'character',
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      success: true,
      data: { candidates: [] },
    })
  })
  it('reports failed services as errors', async () => {
    vi.mocked(fetchDanbooruCatalog).mockRejectedValue(new Error('offline'))
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ success: false })
  })
})
