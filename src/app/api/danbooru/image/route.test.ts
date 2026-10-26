import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/services/research/danbooru-image.service', () => ({
  fetchDanbooruImage: vi.fn(),
}))
import { auth } from '@clerk/nextjs/server'
import { fetchDanbooruImage } from '@/services/research/danbooru-image.service'
import { GET } from './route'
const request = (path: string) =>
  new NextRequest(
    `http://localhost/api/danbooru/image?path=${encodeURIComponent(path)}`,
  )
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1' } as Awaited<
    ReturnType<typeof auth>
  >)
  vi.mocked(fetchDanbooruImage).mockResolvedValue(
    new Response('jpg', { headers: { 'Content-Type': 'image/jpeg' } }),
  )
})
describe('danbooru image API boundary', () => {
  it('rejects anonymous requests before contacting Danbooru', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as Awaited<
      ReturnType<typeof auth>
    >)
    expect((await GET(request('/180x180/9b/67/a.jpg'))).status).toBe(401)
    expect(fetchDanbooruImage).not.toHaveBeenCalled()
  })
  it('only takes CDN image paths', async () => {
    for (const path of [
      '/../secret.jpg',
      '/180x180/a.jpg?x=1',
      '//evil.com/a.jpg',
      '/posts.json',
      '180x180/a.jpg',
    ]) {
      expect((await GET(request(path))).status).toBe(400)
    }
    expect(fetchDanbooruImage).not.toHaveBeenCalled()
  })
  it('streams the image back with a private cache header', async () => {
    const response = await GET(request('/180x180/9b/67/9b67.jpg'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(fetchDanbooruImage).toHaveBeenCalledWith({
      path: '/180x180/9b/67/9b67.jpg',
    })
  })
  it('upstream refusal is a 502', async () => {
    vi.mocked(fetchDanbooruImage).mockResolvedValue(null)
    expect((await GET(request('/180x180/9b/67/9b67.jpg'))).status).toBe(502)
  })
})
