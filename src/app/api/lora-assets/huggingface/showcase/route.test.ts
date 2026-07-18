import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/huggingface-lora.service', () => ({
  getHuggingFaceRepoShowcase: vi.fn(),
}))

import { getHuggingFaceRepoShowcase } from '@/services/huggingface-lora.service'

import { GET } from './route'

const mockGetShowcase = vi.mocked(getHuggingFaceRepoShowcase)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetShowcase.mockResolvedValue({
    images: ['https://cdn-uploads.huggingface.co/production/uploads/a.png'],
    prompts: [],
  })
})

describe('GET /api/lora-assets/huggingface/showcase', () => {
  it('is public and forwards repoId + revision to the service', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface/showcase', {
        repoId: 'lrzjason/Anything2Real',
        revision: 'main',
      }),
    )
    const body = await parseJSON<{
      success: boolean
      data?: { images: string[]; prompts: string[] }
    }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.images).toEqual([
      'https://cdn-uploads.huggingface.co/production/uploads/a.png',
    ])
    expect(mockGetShowcase).toHaveBeenCalledWith(
      'lrzjason/Anything2Real',
      'main',
    )
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=300')
  })

  it('defaults revision to "main" when omitted', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface/showcase', {
        repoId: 'author/repo',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockGetShowcase).toHaveBeenCalledWith('author/repo', 'main')
  })

  it('rejects a missing repoId instead of forwarding an empty query to the service', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface/showcase', {}),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockGetShowcase).not.toHaveBeenCalled()
  })
})
