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
const mockIsContextLimitError = vi.fn(
  (error: unknown) =>
    error instanceof Error && error.message === 'context limit',
)
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
  isLlmTextContextLimitError: (error: unknown) =>
    mockIsContextLimitError(error),
}))

const mockBuildInspirationContext = vi.fn()
vi.mock('@/services/kernel/inspiration-context.service', () => ({
  buildInspirationContext: (...a: unknown[]) =>
    mockBuildInspirationContext(...a),
}))

const mockGatherWebContext = vi.fn()
vi.mock('@/services/web-research.service', () => ({
  gatherWebContext: (...a: unknown[]) => mockGatherWebContext(...a),
  hasWebContext: (context: { results: unknown[]; pages: unknown[] }) =>
    context.results.length > 0 || context.pages.length > 0,
}))

const mockResolveResearchRoute = vi.fn()
vi.mock('@/services/kernel/research-route.service', () => ({
  formatWebContext: (context: {
    results: { title: string; url: string; snippet: string }[]
    pages: { url: string; content: string }[]
  }) =>
    [
      ...context.results.map((r) => `${r.title} ${r.url} ${r.snippet}`),
      ...context.pages.map((p) => `${p.url} ${p.content}`),
    ].join('\n'),
  resolveResearchRoute: (...a: unknown[]) => mockResolveResearchRoute(...a),
}))

import { chatPromptAssistant } from '@/services/kernel/prompt-assistant.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROUTE = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'test-key',
}

describe('chatPromptAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockResolveLlmRoute.mockResolvedValue(FAKE_ROUTE)
    mockBuildInspirationContext.mockResolvedValue('')
    mockGatherWebContext.mockResolvedValue({ results: [], pages: [] })
  })

  it('extracts prompt from a code block in the LLM response', async () => {
    mockLlmCompletion.mockResolvedValue(
      'Here is your prompt:\n\n```\na cat sitting under a tree, golden hour lighting\n```',
    )

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toBe(
      'a cat sitting under a tree, golden hour lighting',
    )
    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        providerManagedOutput: true,
        promptGuardMaxLength: null,
      }),
    )
  })

  it('sends full history first, then compacts once on a provider context error', async () => {
    mockLlmCompletion
      .mockRejectedValueOnce(new Error('context limit'))
      .mockResolvedValueOnce('```\nrecovered prompt\n```')
    const oldestMarker = 'studio-oldest-marker'
    const latestMarker = 'studio-latest-marker'
    const messages = [
      { role: 'user' as const, content: `${oldestMarker} ${'a'.repeat(1800)}` },
      ...Array.from({ length: 30 }, (_, index) => ({
        role: (index % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `history-${index} ${'b'.repeat(1800)}`,
      })),
      { role: 'user' as const, content: latestMarker },
    ]

    await expect(chatPromptAssistant('clerk_1', messages)).resolves.toEqual({
      prompt: 'recovered prompt',
    })

    expect(mockLlmCompletion).toHaveBeenCalledTimes(2)
    expect(mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt).toContain(
      oldestMarker,
    )
    expect(mockLlmCompletion.mock.calls[1]?.[0]?.userPrompt).toContain(
      'earlier messages compacted',
    )
    expect(mockLlmCompletion.mock.calls[1]?.[0]?.userPrompt).toContain(
      latestMarker,
    )
  })

  it('does not retry failures unrelated to the provider input context', async () => {
    mockLlmCompletion.mockRejectedValue(new Error('provider unavailable'))

    await expect(
      chatPromptAssistant('clerk_1', [
        { role: 'user', content: 'keep this request' },
      ]),
    ).rejects.toThrow('provider unavailable')
    expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
  })

  it('falls back to raw text when no code block is present', async () => {
    mockLlmCompletion.mockResolvedValue(
      'a cat sitting under a tree, golden hour lighting',
    )

    const result = await chatPromptAssistant('clerk_1', [
      { role: 'user', content: 'a cat under a tree' },
    ])

    expect(result.prompt).toContain('cat')
  })

  it('passes requested response language into the system prompt', async () => {
    mockLlmCompletion.mockResolvedValue('```\n柔和光线下的猫\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'chinese',
    )

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('Simplified Chinese'),
      }),
    )
  })

  it('uses LoRA conversion rules when requested', async () => {
    mockLlmCompletion.mockResolvedValue(
      '```\naugusta, 1girl, wearing outfit from reference image, blue dress, masterpiece, best quality\n```',
    )

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: '让这个角色穿参考图的衣服' }],
      'illustrious-xl',
      'data:image/png;base64,abc',
      'augusta',
      undefined,
      'chinese',
      'lora',
    )

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: 'data:image/png;base64,abc',
        systemPrompt: expect.stringContaining('LoRA-ready positive prompt'),
        userPrompt: expect.stringContaining(
          '[Current prompt in the editor]: augusta',
        ),
      }),
    )
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain('Output the prompt in English')
    expect(call.systemPrompt).toContain('Preserve existing LoRA trigger words')
    expect(call.systemPrompt).not.toContain('Simplified Chinese')
  })

  // ── RAG: useInspirationContext ─────────────────────────────────

  it('does NOT query the inspiration library when useInspirationContext is false', async () => {
    mockLlmCompletion.mockResolvedValue('```\na sleepy cat\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat under a tree' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      false,
    )

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('injects inspiration context into the system prompt on the first turn', async () => {
    const INSPIRATION_BLOCK =
      '\n\n# Reference Examples (from a curated prompt library)\n... Example 1: dramatic cat scene ...'
    mockBuildInspirationContext.mockResolvedValue(INSPIRATION_BLOCK)
    mockLlmCompletion.mockResolvedValue('```\na cat in golden hour\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'a cat under a tree' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(
      'a cat under a tree',
    )
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain('Reference Examples')
    expect(call.systemPrompt).toContain('dramatic cat scene')
  })

  it('does NOT inject inspiration context on follow-up turns', async () => {
    mockLlmCompletion.mockResolvedValue('```\nrefined prompt\n```')

    await chatPromptAssistant(
      'clerk_1',
      [
        { role: 'user', content: 'a cat under a tree' },
        { role: 'assistant', content: 'A tabby cat resting beneath...' },
        { role: 'user', content: 'make it more dramatic' },
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('prefers currentPrompt over the first message when seeding inspiration lookup', async () => {
    mockBuildInspirationContext.mockResolvedValue('')
    mockLlmCompletion.mockResolvedValue('```\nok\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'make it cinematic' }],
      undefined,
      undefined,
      'an existing prompt about a cat',
      undefined,
      'english',
      'general',
      true,
    )

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(
      'an existing prompt about a cat',
    )
  })

  // ── Research turns (D5, 2026-07-07) ────────────────────────────

  it('does not touch web research when research flag is off', async () => {
    mockLlmCompletion.mockResolvedValue('```\na cat\n```')

    await chatPromptAssistant('clerk_1', [{ role: 'user', content: 'a cat' }])

    expect(mockGatherWebContext).not.toHaveBeenCalled()
    expect(mockResolveResearchRoute).not.toHaveBeenCalled()
  })

  it('injects gathered web context and keeps the selected route (decoupled path)', async () => {
    mockGatherWebContext.mockResolvedValue({
      results: [
        {
          title: 'Ghibli style guide',
          url: 'https://example.com/ghibli',
          snippet: 'soft light',
        },
      ],
      pages: [],
    })
    mockLlmCompletion.mockResolvedValue('```\nghibli cat\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'ghibli style cat' }],
      undefined,
      undefined,
      undefined,
      undefined,
      'english',
      'general',
      undefined,
      true,
    )

    expect(mockGatherWebContext).toHaveBeenCalledWith('ghibli style cat')
    // Decoupled path: any writing model can answer — no grounding borrow.
    expect(mockResolveResearchRoute).not.toHaveBeenCalled()
    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      userPrompt: string
      useGrounding?: boolean
      adapterType: string
    }
    expect(call.userPrompt).toContain('WEB CONTEXT')
    expect(call.userPrompt).toContain('https://example.com/ghibli')
    expect(call.useGrounding).toBeUndefined()
    expect(call.adapterType).toBe(FAKE_ROUTE.adapterType)
  })

  it('falls back to provider-native grounding when no web context is gathered', async () => {
    const GROUNDING_ROUTE = {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
      apiKey: 'grounding-key',
    }
    mockGatherWebContext.mockResolvedValue({ results: [], pages: [] })
    mockResolveResearchRoute.mockResolvedValue({
      route: GROUNDING_ROUTE,
      useGrounding: true,
    })
    mockLlmCompletion.mockResolvedValue('```\nresearched cat\n```')

    await chatPromptAssistant(
      'clerk_1',
      [{ role: 'user', content: 'latest seedream style trends' }],
      undefined,
      undefined,
      undefined,
      'key_1',
      'english',
      'general',
      undefined,
      true,
    )

    expect(mockResolveResearchRoute).toHaveBeenCalledWith(FAKE_USER.id, 'key_1')
    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        apiKey: 'grounding-key',
        useGrounding: true,
      }),
    )
  })

  // ── F1 v2 engine (docs/plans/lora-assistant-nl2tag-2026-07.md §2) ──────
  // Additive opt-in: only reached when `mode:'lora'` carries `loraContext`.

  describe('loraContext (v2 structured engine)', () => {
    it('keeps the legacy code-block output when loraContext is omitted, even in lora mode', async () => {
      mockLlmCompletion.mockResolvedValue('```\nold style output\n```')

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: 'a cat' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
      )

      expect(result.prompt).toBe('old style output')
      expect(result.lora).toBeUndefined()
      expect(mockLlmCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining(
            'Output ONLY the final prompt text inside a markdown code block',
          ),
          responseFormat: undefined,
        }),
      )
    })

    it('switches to the structured JSON engine when loraContext is provided', async () => {
      mockLlmCompletion.mockResolvedValue(
        JSON.stringify({
          positive: ['1girl', 'outdoors'],
          negative: ['lowres'],
          note: 'Kept it simple.',
        }),
      )

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: '雪地里的少女' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        { mounts: [], trayTags: [] },
      )

      expect(mockLlmCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          responseFormat: 'json_object',
          systemPrompt: expect.stringContaining('structured output mode'),
        }),
      )
      expect(result.lora?.positive.map((t) => t.text)).toEqual([
        '1girl',
        'outdoors',
      ])
      expect(result.lora?.negative.map((t) => t.text)).toEqual(['lowres'])
      expect(result.lora?.note).toBe('Kept it simple.')
    })

    it('strips mounted LoRA trigger words from the output even if the model emits them', async () => {
      mockLlmCompletion.mockResolvedValue(
        JSON.stringify({
          positive: ['silver hair', 'masterpiece', '1girl'],
          negative: [],
        }),
      )

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: 'silver haired girl in the snow' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        {
          mounts: [
            {
              name: 'Augusta',
              triggerWords: ['silver hair'],
              family: 'illustrious',
            },
          ],
          trayTags: [],
        },
      )

      const positiveTexts = result.lora?.positive.map((t) => t.text) ?? []
      expect(positiveTexts).not.toContain('silver hair')
      expect(
        result.lora?.positive.some((t) => t.canonical === 'silver_hair'),
      ).toBe(false)
    })

    it('drops tags that are already in the tray before normalizing', async () => {
      mockLlmCompletion.mockResolvedValue(
        JSON.stringify({ positive: ['1girl', 'outdoors'], negative: [] }),
      )

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: 'a girl outdoors' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        { mounts: [], trayTags: ['1girl'] },
      )

      expect(result.lora?.positive.map((t) => t.text)).toEqual(['outdoors'])
    })

    it('retries once when the model returns non-JSON, then succeeds', async () => {
      mockLlmCompletion
        .mockResolvedValueOnce('not json at all')
        .mockResolvedValueOnce(
          JSON.stringify({ positive: ['1girl'], negative: [] }),
        )

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: 'a girl' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        { mounts: [], trayTags: [] },
      )

      expect(mockLlmCompletion).toHaveBeenCalledTimes(2)
      expect(result.lora?.positive.map((t) => t.text)).toEqual(['1girl'])
    })

    it('throws a loud error after the retry is exhausted on persistently invalid output', async () => {
      mockLlmCompletion.mockResolvedValue('still not json')

      await expect(
        chatPromptAssistant(
          'clerk_1',
          [{ role: 'user', content: 'a girl' }],
          undefined,
          undefined,
          undefined,
          undefined,
          'english',
          'lora',
          undefined,
          undefined,
          { mounts: [], trayTags: [] },
        ),
      ).rejects.toThrow()

      expect(mockLlmCompletion).toHaveBeenCalledTimes(2)
    })
  })
})
