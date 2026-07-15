import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockStreamText = vi.fn()
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
const mockIsLlmTextContextLimitError = vi.fn(
  (error: unknown) =>
    error instanceof Error && error.message === 'context limit',
)
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
  isLlmTextContextLimitError: (error: unknown) =>
    mockIsLlmTextContextLimitError(error),
}))

const mockFindActiveKeyForAdapter = vi.fn()
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: (...args: unknown[]) =>
    mockFindActiveKeyForAdapter(...args),
}))

const mockGetSystemApiKey = vi.fn()
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: (...args: unknown[]) => mockGetSystemApiKey(...args),
}))

const mockGatherWebContext = vi.fn()
vi.mock('@/services/web-research.service', () => ({
  gatherWebContext: (...args: unknown[]) => mockGatherWebContext(...args),
  hasWebContext: (context: { results: unknown[]; pages: unknown[] }) =>
    context.results.length > 0 || context.pages.length > 0,
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createNodeAssistantStream } from '@/services/node/node-assistant.service'
import type { NodeAssistantRequest } from '@/types/node-assistant'

const REQUEST: NodeAssistantRequest = {
  locale: 'en',
  selectedNodeIds: ['node-1'],
  messages: [{ role: 'user', content: 'What should I run next?' }],
  nodes: [
    {
      id: 'node-1',
      type: NODE_TYPE_IDS.composer,
      status: NODE_STATUS_IDS.idle,
      title: 'Composer',
      summary: 'A small story idea.',
    },
  ],
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    output += decoder.decode(value, { stream: true })
  }

  output += decoder.decode()
  return output
}

async function* createTextStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLlmTextCompletion.mockReset()
  mockStreamText.mockReset()
  vi.unstubAllEnvs()
  vi.stubEnv('AI_GATEWAY_API_KEY', '')
  vi.stubEnv('VERCEL', '')
  mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
  mockResolveLlmTextRoute.mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
    apiKey: 'gemini-key',
  })
  mockFindActiveKeyForAdapter.mockResolvedValue(null)
  mockGetSystemApiKey.mockReturnValue(undefined)
  mockGatherWebContext.mockResolvedValue({ results: [], pages: [] })
})

describe('createNodeAssistantStream', () => {
  it('uses the existing BYOK LLM route when AI Gateway is not configured', async () => {
    mockLlmTextCompletion.mockResolvedValue('Use [[node:node-1]] next.')

    const stream = await createNodeAssistantStream('clerk_user_1', REQUEST)

    await expect(readStream(stream)).resolves.toBe('Use [[node:node-1]] next.')
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_user_1')
    expect(mockResolveLlmTextRoute).toHaveBeenCalledWith('db_user_1', undefined)
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: 'gemini-key',
        providerManagedOutput: true,
        promptGuardMaxLength: null,
        // label≠actual fix: the Gemini assistant route resolves to the
        // assistant-table model (3.5 Flash), not the generic text default.
        modelId: 'gemini-3.5-flash',
      }),
    )
  })

  it('includes directly uploaded media references without requiring a canvas node id', async () => {
    mockLlmTextCompletion.mockResolvedValue('Use the attached image.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      references: [
        {
          id: 'uploaded-image:1',
          source: 'upload',
          kind: 'image',
          url: 'https://cdn.example.com/reference.png',
          label: 'reference.png',
        },
      ],
    })

    await readStream(stream)
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]?.userPrompt).toContain(
      '[image] reference.png (upload)',
    )
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]?.userPrompt).toContain(
      'https://cdn.example.com/reference.png',
    )
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]?.imageData).toEqual([
      'https://cdn.example.com/reference.png',
    ])
  })

  it('streams through AI Gateway when configured', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key')
    mockStreamText.mockReturnValue({
      textStream: createTextStream(['Gateway ', 'answer']),
    })

    const stream = await createNodeAssistantStream('clerk_user_1', REQUEST)

    await expect(readStream(stream)).resolves.toBe('Gateway answer')
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.5',
        prompt: expect.stringContaining('[[node:node-1]]'),
      }),
    )
    expect(mockStreamText.mock.calls[0]?.[0]).not.toHaveProperty(
      'maxOutputTokens',
    )
    expect(mockEnsureUser).not.toHaveBeenCalled()
  })

  it('uses the selected BYOK route even when AI Gateway is configured', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key')
    mockLlmTextCompletion.mockResolvedValue('Selected route answer.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      apiKeyId: 'key-selected',
    })

    await expect(readStream(stream)).resolves.toBe('Selected route answer.')
    expect(mockStreamText).not.toHaveBeenCalled()
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_user_1')
    expect(mockResolveLlmTextRoute).toHaveBeenCalledWith(
      'db_user_1',
      'key-selected',
    )
  })

  it('sends full conversation context and lets the provider enforce its model limit', async () => {
    mockLlmTextCompletion.mockResolvedValue('Continue from the latest turn.')
    const oldestMarker = 'oldest-history-marker'
    const latestMarker = 'latest-user-turn-marker'
    const messages = [
      { role: 'user' as const, content: `${oldestMarker} ${'a'.repeat(1200)}` },
      ...Array.from({ length: 40 }, (_, index) => ({
        role: (index % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `history-${index} ${'b'.repeat(1200)}`,
      })),
      { role: 'user' as const, content: latestMarker },
    ]

    await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      messages,
    })

    const input = mockLlmTextCompletion.mock.calls[0]?.[0] as
      | {
          promptGuardMaxLength?: number | null
          providerManagedOutput?: boolean
          maxTokens?: number
          userPrompt?: string
        }
      | undefined
    expect(input?.promptGuardMaxLength).toBeNull()
    expect(input?.providerManagedOutput).toBe(true)
    expect(input?.maxTokens).toBeUndefined()
    expect(input?.userPrompt).toContain(latestMarker)
    expect(input?.userPrompt).toContain(oldestMarker)
    expect(input?.userPrompt).not.toContain('earlier messages omitted')
  })

  it('compacts older conversation and retries once after a provider context-limit error', async () => {
    mockLlmTextCompletion
      .mockRejectedValueOnce(new Error('context limit'))
      .mockResolvedValueOnce('Recovered after compaction.')
    const oldestMarker = 'oldest-history-marker'
    const latestMarker = 'latest-user-turn-marker'
    const messages = [
      { role: 'user' as const, content: `${oldestMarker} ${'a'.repeat(1200)}` },
      ...Array.from({ length: 40 }, (_, index) => ({
        role: (index % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `history-${index} ${'b'.repeat(1200)}`,
      })),
      { role: 'user' as const, content: latestMarker },
    ]

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      messages,
    })

    await expect(readStream(stream)).resolves.toBe(
      'Recovered after compaction.',
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    const firstPrompt = mockLlmTextCompletion.mock.calls[0]?.[0]?.userPrompt
    const retryPrompt = mockLlmTextCompletion.mock.calls[1]?.[0]?.userPrompt
    expect(firstPrompt).toContain(oldestMarker)
    expect(retryPrompt).toContain(oldestMarker)
    expect(retryPrompt).toContain(latestMarker)
    expect(retryPrompt).toContain('earlier messages compacted')
    expect(retryPrompt.length).toBeLessThanOrEqual(
      NODE_STUDIO_ASSISTANT_LIMITS.contextCompactionTargetLength,
    )
  })

  it('does not retry errors that are unrelated to the input context limit', async () => {
    mockLlmTextCompletion.mockRejectedValueOnce(new Error('provider offline'))

    await expect(
      createNodeAssistantStream('clerk_user_1', REQUEST),
    ).rejects.toThrow('provider offline')
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  it('bounds an oversized latest message on the context-limit retry', async () => {
    mockLlmTextCompletion
      .mockRejectedValueOnce(new Error('context limit'))
      .mockResolvedValueOnce('Recovered after compacting the latest message.')
    const latestMessage = `latest-head ${'x'.repeat(60_000)} latest-tail`

    await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      messages: [{ role: 'user', content: latestMessage }],
    })

    const retryPrompt = mockLlmTextCompletion.mock.calls[1]?.[0]?.userPrompt
    expect(retryPrompt.length).toBeLessThanOrEqual(
      NODE_STUDIO_ASSISTANT_LIMITS.contextCompactionTargetLength,
    )
    expect(retryPrompt).toContain('latest-head')
    expect(retryPrompt).toContain('latest-tail')
    expect(retryPrompt).toContain('middle compacted')
  })

  it('compacts and retries an AI Gateway stream only before output starts', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key')
    async function* failBeforeOutput(): AsyncIterable<string> {
      throw new Error('context limit')
    }
    mockStreamText
      .mockReturnValueOnce({ textStream: failBeforeOutput() })
      .mockReturnValueOnce({
        textStream: createTextStream(['Gateway recovered']),
      })
    const oldestMarker = 'gateway-oldest-marker'
    const latestMarker = 'gateway-latest-marker'
    const messages = [
      { role: 'user' as const, content: `${oldestMarker} ${'a'.repeat(1200)}` },
      ...Array.from({ length: 40 }, (_, index) => ({
        role: (index % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `history-${index} ${'b'.repeat(1200)}`,
      })),
      { role: 'user' as const, content: latestMarker },
    ]

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...REQUEST,
      messages,
    })

    await expect(readStream(stream)).resolves.toBe('Gateway recovered')
    expect(mockStreamText).toHaveBeenCalledTimes(2)
    expect(mockStreamText.mock.calls[0]?.[0]?.prompt).toContain(oldestMarker)
    expect(mockStreamText.mock.calls[1]?.[0]?.prompt).toContain(
      'earlier messages compacted',
    )
    expect(mockStreamText.mock.calls[1]?.[0]?.prompt).toContain(latestMarker)
  })
})

describe('createNodeAssistantStream — reference research turn', () => {
  const RESEARCH_REQUEST: NodeAssistantRequest = {
    ...REQUEST,
    research: true,
    messages: [
      {
        role: 'user',
        content:
          'Study the pacing of a slow-burn convenience-store romance short and suggest an original script.',
      },
    ],
  }

  it('grounds through the selected route when it is grounding-capable (Gemini)', async () => {
    mockLlmTextCompletion.mockResolvedValue('Research result.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...RESEARCH_REQUEST,
      apiKeyId: 'key-gemini',
    })

    await expect(readStream(stream)).resolves.toBe('Research result.')
    expect(mockStreamText).not.toHaveBeenCalled()
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: 'gemini-key',
        modelId: 'gemini-3.5-flash',
        useGrounding: true,
      }),
    )
  })

  it('borrows a grounding route when the selected route cannot ground (DeepSeek → Gemini)', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'deepseek-key',
    })
    mockFindActiveKeyForAdapter.mockImplementation(
      async (_userId: string, adapterType: AI_ADAPTER_TYPES) =>
        adapterType === AI_ADAPTER_TYPES.GEMINI
          ? {
              id: 'gk',
              modelId: 'gemini-3.5-flash',
              adapterType: AI_ADAPTER_TYPES.GEMINI,
              providerConfig: {
                label: 'Gemini',
                baseUrl: 'https://generativelanguage.googleapis.com',
              },
              label: 'g',
              keyValue: 'borrowed-gemini-key',
            }
          : null,
    )
    mockLlmTextCompletion.mockResolvedValue('Research result.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...RESEARCH_REQUEST,
      apiKeyId: 'key-deepseek',
    })

    await readStream(stream)
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: 'borrowed-gemini-key',
        useGrounding: true,
      }),
    )
  })

  it('degrades to model knowledge (grounding off) when nothing can ground', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'deepseek-key',
    })
    mockLlmTextCompletion.mockResolvedValue('Research result.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...RESEARCH_REQUEST,
      apiKeyId: 'key-deepseek',
    })

    await readStream(stream)
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: 'deepseek-key',
        useGrounding: false,
      }),
    )
  })

  it('bypasses the AI Gateway even when configured, using a platform grounding key', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key')
    mockGetSystemApiKey.mockReturnValue('platform-gemini-key')
    mockLlmTextCompletion.mockResolvedValue('Research result.')

    const stream = await createNodeAssistantStream(
      'clerk_user_1',
      RESEARCH_REQUEST,
    )

    await expect(readStream(stream)).resolves.toBe('Research result.')
    expect(mockStreamText).not.toHaveBeenCalled()
    expect(mockLlmTextCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: 'platform-gemini-key',
        useGrounding: true,
      }),
    )
  })

  it('uses gathered web context on ANY model with grounding off (decoupled)', async () => {
    mockGatherWebContext.mockResolvedValue({
      results: [{ title: 'T', url: 'https://t.test', snippet: 's' }],
      pages: [],
    })
    // Selected route is DeepSeek — proves a non-grounding model can now research
    // because the web context is injected, not fetched by the model.
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: {
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
      },
      apiKey: 'deepseek-key',
    })
    mockLlmTextCompletion.mockResolvedValue('Research result.')

    const stream = await createNodeAssistantStream('clerk_user_1', {
      ...RESEARCH_REQUEST,
      apiKeyId: 'key-deepseek',
    })

    await expect(readStream(stream)).resolves.toBe('Research result.')
    const call = mockLlmTextCompletion.mock.calls[0][0]
    expect(call.adapterType).toBe(AI_ADAPTER_TYPES.DEEPSEEK)
    expect(call.useGrounding).toBeUndefined()
    expect(call.userPrompt).toContain('WEB CONTEXT')
    expect(call.userPrompt).toContain('https://t.test')
  })
})
