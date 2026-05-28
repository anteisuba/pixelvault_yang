import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

const mockBuildInspirationContext = vi.fn()
vi.mock('@/services/inspiration.service', () => ({
  buildInspirationContext: (...a: unknown[]) =>
    mockBuildInspirationContext(...a),
}))

import { enhancePrompt } from '@/services/kernel/prompt-enhance.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { PROMPT_ENHANCE, type PromptEnhanceStyle } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'test-key',
}

const ORIGINAL_PROMPT = 'a cat under a tree'
const ENHANCED_REPLY =
  'A tabby cat rests beneath a gnarled oak, dappled late-afternoon sunlight filtering through layered leaves, soft chiaroscuro on the fur, subsurface scattering on the ears, shallow depth of field with 85mm compression, warm earth-tone palette, calm contemplative mood.'

describe('enhancePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
    mockBuildInspirationContext.mockResolvedValue('')
  })

  it.each(PROMPT_ENHANCE.STYLES)(
    'returns validated enhanced prompt for style "%s"',
    async (style: PromptEnhanceStyle) => {
      mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

      const result = await enhancePrompt('clerk_1', ORIGINAL_PROMPT, style)

      expect(result.style).toBe(style)
      expect(result.original).toBe(ORIGINAL_PROMPT)
      expect(result.enhanced).toBe(ENHANCED_REPLY)
      expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
    },
  )

  it('passes a non-empty system prompt to the LLM for every style', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    for (const style of PROMPT_ENHANCE.STYLES) {
      mockLlmCompletion.mockClear()
      await enhancePrompt('clerk_1', ORIGINAL_PROMPT, style)

      const call = mockLlmCompletion.mock.calls[0]?.[0] as
        | { systemPrompt: string; userPrompt: string }
        | undefined
      expect(call).toBeDefined()
      expect(call?.systemPrompt.length).toBeGreaterThan(50)
      expect(call?.userPrompt).toBe(ORIGINAL_PROMPT)
    }
  })

  it('injects model-specific hint into the system prompt when modelId is provided', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
      AI_MODELS.FLUX_2_PRO,
    )

    const call = mockLlmCompletion.mock.calls[0]?.[0] as
      | { systemPrompt: string }
      | undefined
    expect(call?.systemPrompt).toMatch(/Model-specific guidance/i)
  })

  it('falls back to the original prompt when the LLM output is rejected', async () => {
    // Meta-commentary that the validator will reject after stripping fails.
    mockLlmCompletion.mockResolvedValue('') // empty output → unusable

    const result = await enhancePrompt('clerk_1', ORIGINAL_PROMPT, 'detailed')

    expect(result.enhanced).toBe(ORIGINAL_PROMPT)
    expect(result.original).toBe(ORIGINAL_PROMPT)
    expect(result.style).toBe('detailed')
  })

  it('falls back to the original prompt when the LLM leaks system prompt content', async () => {
    mockLlmCompletion.mockResolvedValue(
      'You are an expert AI prompt engineer specializing in photorealism. Return only the enhanced prompt.',
    )

    const result = await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
    )

    expect(result.enhanced).toBe(ORIGINAL_PROMPT)
  })

  it('forwards the resolved LLM route credentials to llmTextCompletion', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt('clerk_1', ORIGINAL_PROMPT, 'detailed')

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: FAKE_ROUTE.adapterType,
        providerConfig: FAKE_ROUTE.providerConfig,
        apiKey: FAKE_ROUTE.apiKey,
      }),
    )
  })

  // ── RAG: useInspirationContext ─────────────────────────────────

  it('does NOT query the inspiration library when useInspirationContext is false', async () => {
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'detailed',
      undefined,
      undefined,
      false,
    )

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('appends the inspiration context to the system prompt when enabled', async () => {
    const INSPIRATION_BLOCK =
      '\n\n# Reference Examples (from a curated prompt library)\n... Example 1: cat scene ...'
    mockBuildInspirationContext.mockResolvedValue(INSPIRATION_BLOCK)
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'photorealistic',
      undefined,
      undefined,
      true,
    )

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(ORIGINAL_PROMPT)
    const call = mockLlmCompletion.mock.calls[0]?.[0] as
      | { systemPrompt: string }
      | undefined
    expect(call?.systemPrompt).toContain('Reference Examples')
    expect(call?.systemPrompt).toContain('Example 1: cat scene')
  })

  it('falls back gracefully when inspiration context lookup returns empty', async () => {
    mockBuildInspirationContext.mockResolvedValue('') // no matches / failure
    mockLlmCompletion.mockResolvedValue(ENHANCED_REPLY)

    const result = await enhancePrompt(
      'clerk_1',
      ORIGINAL_PROMPT,
      'detailed',
      undefined,
      undefined,
      true,
    )

    // Should still produce a valid enhanced prompt; system prompt has no RAG block
    expect(result.enhanced).toBe(ENHANCED_REPLY)
    const call = mockLlmCompletion.mock.calls[0]?.[0] as
      | { systemPrompt: string }
      | undefined
    expect(call?.systemPrompt).not.toContain('Reference Examples')
  })
})
