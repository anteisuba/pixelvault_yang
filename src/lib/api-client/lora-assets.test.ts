import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { fetchHuggingFaceShowcaseAPI } from '@/lib/api-client/lora-assets'

afterEach(() => {
  vi.unstubAllGlobals()
})

// 库侧封面渐进增强（2026-07-18 方案 B）——客户端对落到社交横幅兜底的卡
// 懒加载调用这个 wrapper。
describe('fetchHuggingFaceShowcaseAPI', () => {
  it('requests the showcase endpoint with repoId + revision and returns the parsed payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            images: [
              'https://cdn-uploads.huggingface.co/production/uploads/a.png',
            ],
            prompts: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchHuggingFaceShowcaseAPI({
      repoId: 'lrzjason/Anything2Real',
      revision: 'main',
    })

    expect(result.success).toBe(true)
    expect(result.data?.images).toEqual([
      'https://cdn-uploads.huggingface.co/production/uploads/a.png',
    ])
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain(API_ENDPOINTS.LORA_ASSETS_HUGGINGFACE_SHOWCASE)
    expect(url).toContain('repoId=lrzjason%2FAnything2Real')
    expect(url).toContain('revision=main')
  })

  it('surfaces a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await fetchHuggingFaceShowcaseAPI({
      repoId: 'author/repo',
      revision: 'main',
    })

    expect(result).toEqual({ success: false, error: 'network down' })
  })

  it('surfaces a non-ok HTTP response as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 500 })),
    )

    const result = await fetchHuggingFaceShowcaseAPI({
      repoId: 'author/repo',
      revision: 'main',
    })

    expect(result.success).toBe(false)
  })
})
