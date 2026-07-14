import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStreamNodeAssistantAPI = vi.fn()
const mockListAssistantConversationsAPI = vi.fn()
const mockGetAssistantConversationAPI = vi.fn()
const mockUpsertAssistantConversationAPI = vi.fn()

vi.mock('@/lib/api-client', () => ({
  streamNodeAssistantAPI: (...args: unknown[]) =>
    mockStreamNodeAssistantAPI(...args),
  listAssistantConversationsAPI: (...args: unknown[]) =>
    mockListAssistantConversationsAPI(...args),
  getAssistantConversationAPI: (...args: unknown[]) =>
    mockGetAssistantConversationAPI(...args),
  upsertAssistantConversationAPI: (...args: unknown[]) =>
    mockUpsertAssistantConversationAPI(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock('next-intl', () => {
  const t = (key: string) => key

  return {
    useTranslations: () => t,
  }
})

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { useAssistantConversation } from '@/hooks/use-assistant-conversation'
import type { AssistantConversationContext } from '@/hooks/use-assistant-conversation'

const encoder = new TextEncoder()

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

const CONTEXT: AssistantConversationContext = {
  locale: 'zh',
  selectedNodeIds: ['node-1'],
  nodes: [
    {
      id: 'node-1',
      type: NODE_TYPE_IDS.composer,
      status: NODE_STATUS_IDS.idle,
      title: 'Composer',
      summary: 'story idea',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListAssistantConversationsAPI.mockResolvedValue({
    success: true,
    data: [],
  })
  mockGetAssistantConversationAPI.mockResolvedValue({
    success: true,
    data: null,
  })
  mockUpsertAssistantConversationAPI.mockResolvedValue({
    success: true,
    data: {
      id: 'session-1',
      surface: 'NODE_CANVAS',
      projectId: 'project-1',
      title: 'test',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
})

describe('useAssistantConversation', () => {
  it('accumulates streamed assistant messages and extracts node references', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: true,
      stream: createStream(['Check ', '[[node:node-1]]', '.']),
    })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('Please review', CONTEXT)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'Please review',
    })
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Check .',
      references: [{ nodeId: 'node-1' }],
    })
    expect(mockStreamNodeAssistantAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'zh',
        selectedNodeIds: ['node-1'],
      }),
    )
  })

  it('extracts confirmed capability markers without persisting marker text', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: true,
      stream: createStream(['Run it [[capability:upscale:node-1]]']),
    })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('Upscale this image', CONTEXT)
    })

    expect(result.current.messages[1]).toMatchObject({
      content: 'Run it',
      capabilities: [{ capability: 'upscale', nodeId: 'node-1' }],
    })
  })

  it('surfaces API errors and removes the pending assistant placeholder', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: false,
      error: 'missing key',
      errorCode: 'MISSING_KEY',
    })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('hello', CONTEXT)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe('missing key')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello',
    })
  })

  it('forwards the selected assistant api key route', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: true,
      stream: createStream(['ok']),
    })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('use this route', {
        ...CONTEXT,
        apiKeyId: 'key-selected',
      })
    })

    expect(mockStreamNodeAssistantAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key-selected',
      }),
    )
  })

  it('retries the last user message without duplicating it', async () => {
    mockStreamNodeAssistantAPI
      .mockResolvedValueOnce({
        success: false,
        error: 'offline',
      })
      .mockResolvedValueOnce({
        success: true,
        stream: createStream(['recovered']),
      })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('retry this', CONTEXT)
    })
    await act(async () => {
      await result.current.retry(CONTEXT)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'retry this',
    })
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'recovered',
    })
    expect(mockStreamNodeAssistantAPI).toHaveBeenCalledTimes(2)
  })
})
