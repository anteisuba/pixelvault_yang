import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGET, parseJSON } from '@/test/api-helpers'
import type { PromptTagDefinition } from '@/types/prompt-tags'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/model-keyword.service', () => ({
  searchModelKeywordLoraTags: vi.fn(),
}))

import { searchModelKeywordLoraTags } from '@/services/model-keyword.service'

import { GET } from './route'

const mockSearchModelKeywordLoraTags = vi.mocked(searchModelKeywordLoraTags)

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchModelKeywordLoraTags.mockResolvedValue([
    {
      id: 'model-keyword:00025a10:0:jackie',
      type: 'lora_trigger',
      source: 'model_keyword',
      label: 'Jackie',
      promptText: 'Jackie',
      aliases: ['00025a10'],
      category: 'lora',
      polarity: 'positive',
      modelFamilies: ['any'],
      orderGroup: 34,
      confidence: 'inferred',
    },
  ])
})

describe('GET /api/prompt-tags/model-keyword', () => {
  it('returns model-keyword prompt tags for a valid query', async () => {
    const response = await GET(
      createGET('/api/prompt-tags/model-keyword', {
        query: 'jack',
        limit: '6',
      }),
    )
    const body = await parseJSON<{
      success: boolean
      data: PromptTagDefinition[]
    }>(response)

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data[0]?.source).toBe('model_keyword')
    expect(mockSearchModelKeywordLoraTags).toHaveBeenCalledWith({
      query: 'jack',
      limit: 6,
    })
  })

  it('rejects queries that are too short', async () => {
    const response = await GET(
      createGET('/api/prompt-tags/model-keyword', {
        query: 'j',
      }),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockSearchModelKeywordLoraTags).not.toHaveBeenCalled()
  })
})
