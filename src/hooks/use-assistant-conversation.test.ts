import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStreamNodeAssistantAPI = vi.fn()

vi.mock('@/lib/api-client/node-assistant', () => ({
  streamNodeAssistantAPI: (...args: unknown[]) =>
    mockStreamNodeAssistantAPI(...args),
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
})

describe('useAssistantConversation', () => {
  it('accumulates streamed assistant messages and extracts node references', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: true,
      stream: createStream(['检查 ', '[[node:node-1]]', '。']),
    })

    const { result } = renderHook(() => useAssistantConversation())

    await act(async () => {
      await result.current.send('帮我看一下', CONTEXT)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: '帮我看一下',
    })
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: '检查 。',
      references: [{ nodeId: 'node-1' }],
    })
    expect(mockStreamNodeAssistantAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'zh',
        selectedNodeIds: ['node-1'],
      }),
    )
  })

  it('surfaces API errors and removes the pending assistant placeholder', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: false,
      error: 'missing key',
      errorCode: 'MISSING_KEY',
    })

    const { result } = renderHook(() => useAssistantConversation())

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

    const { result } = renderHook(() => useAssistantConversation())

    await act(async () => {
      await result.current.send('走这条路由', {
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

  it('retries the last user message', async () => {
    mockStreamNodeAssistantAPI
      .mockResolvedValueOnce({
        success: false,
        error: 'offline',
      })
      .mockResolvedValueOnce({
        success: true,
        stream: createStream(['恢复']),
      })

    const { result } = renderHook(() => useAssistantConversation())

    await act(async () => {
      await result.current.send('重试这个问题', CONTEXT)
    })
    await act(async () => {
      await result.current.retry(CONTEXT)
    })

    expect(mockStreamNodeAssistantAPI).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '恢复',
    })
  })
})
