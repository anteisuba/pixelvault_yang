import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmRoute(...args),
}))

vi.mock('@/lib/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
  sanitizePrompt: vi.fn((prompt: string) => prompt),
}))

const FAKE_ROUTE = {
  adapterType: 'gemini',
  providerConfig: { endpoint: 'https://gemini.example.com', name: 'Gemini' },
  apiKey: 'test-key',
}

import type { ReferenceAsset } from '@/types'
import { parseImageIntent } from './intent-parser.service'

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
})

describe('parseImageIntent', () => {
  it('returns parsed ImageIntent when LLM returns valid JSON', async () => {
    const llmJson = JSON.stringify({
      subject: 'a young woman',
      style: 'cinematic photorealism',
      mood: 'melancholic',
      scene: 'Tokyo street at night',
    })
    mockLlmCompletion.mockResolvedValue(llmJson)

    const result = await parseImageIntent('a cinematic portrait in Tokyo')

    expect(result.subject).toBe('a young woman')
    expect(result.style).toBe('cinematic photorealism')
    expect(result.mood).toBe('melancholic')
  })

  it('falls back to minimal intent when LLM returns invalid JSON', async () => {
    mockLlmCompletion.mockResolvedValue('not valid json at all')

    const result = await parseImageIntent('a cat playing piano')

    expect(result.subject).toBe('a cat playing piano')
  })

  it('falls back to minimal intent when LLM throws', async () => {
    mockLlmCompletion.mockRejectedValue(new Error('LLM provider timeout'))

    const result = await parseImageIntent('a rainy street')

    expect(result.subject).toBe('a rainy street')
  })

  it('includes referenceAssets in returned intent when provided', async () => {
    const refs: ReferenceAsset[] = [
      { url: 'https://example.com/ref.jpg', role: 'identity' },
    ]
    const llmJson = JSON.stringify({ subject: 'person from reference' })
    mockLlmCompletion.mockResolvedValue(llmJson)

    const result = await parseImageIntent('portrait', refs)

    expect(result.referenceAssets).toEqual(refs)
  })

  it('falls back gracefully when LLM returns JSON with wrong schema', async () => {
    mockLlmCompletion.mockResolvedValue(JSON.stringify({ style: 'anime' }))

    const result = await parseImageIntent('anime girl')

    expect(result.subject).toBe('anime girl')
  })

  it('strips LLM markdown fences before parsing', async () => {
    const wrapped = '```json\n{"subject":"test subject"}\n```'
    mockLlmCompletion.mockResolvedValue(wrapped)

    const result = await parseImageIntent('some prompt')

    expect(result.subject).toBe('test subject')
  })
})
