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
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
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
      }),
    )
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
        model: 'openai/gpt-5.4',
        prompt: expect.stringContaining('[[node:node-1]]'),
      }),
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
})
