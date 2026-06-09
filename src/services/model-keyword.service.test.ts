import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import {
  __resetModelKeywordCacheForTests,
  searchModelKeywordLoraTags,
} from '@/services/model-keyword.service'

const mockFetch = vi.fn<typeof fetch>()

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  __resetModelKeywordCacheForTests()
})

describe('searchModelKeywordLoraTags', () => {
  it('parses model-keyword LoRA trigger rows into prompt tags', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(`# Do NOT update this file.
00007f4f, morizonoyurie| brown hair| short hair|purple eyes
00025a10, Jackie| 1girl| solo| orange hair, jackie.safetensors
`),
    )

    const results = await searchModelKeywordLoraTags({
      query: 'jack',
      limit: 4,
    })

    expect(results.map((tag) => tag.promptText)).toEqual([
      'Jackie',
      '1girl',
      'solo',
      'orange hair',
    ])
    expect(results[0]).toMatchObject({
      id: 'model-keyword:00025a10:0:jackie',
      type: 'lora_trigger',
      source: 'model_keyword',
      category: 'lora',
      polarity: 'positive',
      confidence: 'inferred',
    })
    expect(results[0]?.aliases).toContain('jackie.safetensors')
  })

  it('keeps negative model-keyword rows on the negative side', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse('00010981, NEGATIVE: text| watermark|bad hands'),
    )

    const results = await searchModelKeywordLoraTags({
      query: 'water',
    })

    expect(results).toHaveLength(3)
    expect(results[0]?.source).toBe('model_keyword')
    expect(results[0]?.polarity).toBe('negative')
  })
})
