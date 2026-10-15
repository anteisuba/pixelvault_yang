import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/kernel/prompt-guard', () => ({
  validatePrompt: vi.fn(() => ({ valid: true })),
  sanitizePrompt: vi.fn((prompt: string) => prompt),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmRoute(...args),
}))

import { GenerationValidationError } from '@/lib/errors'
import { sanitizePrompt, validatePrompt } from '@/services/kernel/prompt-guard'
import type { ReferenceAsset } from '@/types'
import { parseImageIntent } from './intent-parser.service'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(validatePrompt).mockReturnValue({ valid: true, warnings: [] })
  vi.mocked(sanitizePrompt).mockImplementation((prompt: string) => prompt)
})

describe('parseImageIntent', () => {
  it('把原话当主体', async () => {
    const result = await parseImageIntent('a cat playing piano')

    expect(result.subject).toBe('a cat playing piano')
  })

  it('⛔ 不调模型、不挑任何一家的 key', async () => {
    await parseImageIntent('a cinematic portrait in Tokyo')

    expect(mockResolveLlmRoute).not.toHaveBeenCalled()
    expect(mockLlmCompletion).not.toHaveBeenCalled()
  })

  it('throws GenerationValidationError when prompt guard rejects input', async () => {
    vi.mocked(validatePrompt).mockReturnValue({
      valid: false,
      reason: 'blocked',
      warnings: [],
    })

    await expect(parseImageIntent('bad')).rejects.toBeInstanceOf(
      GenerationValidationError,
    )
  })

  it('uses the sanitized input, capped at 500 chars', async () => {
    vi.mocked(sanitizePrompt).mockReturnValue('x'.repeat(600))

    const result = await parseImageIntent('raw input')

    expect(sanitizePrompt).toHaveBeenCalledWith('raw input')
    expect(result.subject).toHaveLength(500)
  })

  it('includes referenceAssets in returned intent when provided', async () => {
    const referenceAssets: ReferenceAsset[] = [
      { url: 'https://example.com/img.jpg', role: 'identity' },
    ]

    const result = await parseImageIntent('a portrait', referenceAssets)

    expect(result.referenceAssets).toEqual(referenceAssets)
  })
})
