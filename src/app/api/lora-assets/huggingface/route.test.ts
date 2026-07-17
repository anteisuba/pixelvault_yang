import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, parseJSON } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/huggingface-lora.service', () => ({
  searchHuggingFaceLoras: vi.fn(),
}))

import { searchHuggingFaceLoras } from '@/services/huggingface-lora.service'

import { GET } from './route'

const mockSearch = vi.mocked(searchHuggingFaceLoras)

beforeEach(() => {
  vi.clearAllMocks()
  mockSearch.mockResolvedValue({
    items: [],
    total: null,
    page: 1,
    limit: 12,
    hasNextPage: false,
    nextCursor: null,
  })
})

describe('GET /api/lora-assets/huggingface', () => {
  it('is public and defaults to all image-LoRA families', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface', { search: 'style' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockSearch).toHaveBeenCalledWith({
      search: 'style',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=300')
  })

  it('rejects invalid pagination instead of forwarding it to HF', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface', { limit: '999' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockSearch).not.toHaveBeenCalled()
  })

  // S2（docs/references/pages/lora-workbench.md §2.5/§3）：URL `type=` binds
  // directly onto the schema field of the same name (createApiGetRoute keys
  // off Object.fromEntries(searchParams)).
  it('passes type=clothing through to the service', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface', {
        search: 'style',
        type: 'clothing',
      }),
    )

    expect(response.status).toBe(200)
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clothing' }),
    )
  })

  it('rejects an invalid type value', async () => {
    const response = await GET(
      createGET('/api/lora-assets/huggingface', { type: 'not-a-type' }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockSearch).not.toHaveBeenCalled()
  })
})
