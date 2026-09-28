import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
}))
vi.mock('@/services/research/danbooru-favorite.service', () => ({
  addDanbooruFavorite: vi.fn(),
  listDanbooruFavorites: vi.fn(),
}))
import { auth } from '@clerk/nextjs/server'
import {
  addDanbooruFavorite,
  listDanbooruFavorites,
} from '@/services/research/danbooru-favorite.service'
import { GET, POST } from './route'
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/danbooru/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const valid = {
  kind: 'copyright',
  name: 'princess_connect!',
  count: 28000,
  previews: ['https://cdn.donmai.us/a.jpg'],
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as Awaited<
    ReturnType<typeof auth>
  >)
  vi.mocked(listDanbooruFavorites).mockResolvedValue([])
})
describe('favorites API boundary', () => {
  it('rejects anonymous requests', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    expect(
      (await GET(new NextRequest('http://localhost/api/danbooru/favorites')))
        .status,
    ).toBe(401)
    expect((await POST(post(valid))).status).toBe(401)
    expect(listDanbooruFavorites).not.toHaveBeenCalled()
    expect(addDanbooruFavorite).not.toHaveBeenCalled()
  })
  it('adds a favorite for the signed-in user', async () => {
    expect((await POST(post(valid))).status).toBe(200)
    expect(addDanbooruFavorite).toHaveBeenCalledWith('user-1', {
      ...valid,
      work: null,
    })
  })
  it('only accepts previews from the Danbooru CDN', async () => {
    const response = await POST(
      post({ ...valid, previews: ['https://evil.example/a.jpg'] }),
    )
    expect(response.status).toBe(400)
    expect(addDanbooruFavorite).not.toHaveBeenCalled()
  })
})
