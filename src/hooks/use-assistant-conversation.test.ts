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
  const t = Object.assign((key: string) => key, { has: () => true })

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

/**
 * 把 `script` 一个字符一个字符地灌进助手流，返回**每一帧**渲染出来的助手正文。
 *
 * ⚠ 每个字符单独包一次 `act`：`createStream` 那种一口气 enqueue 完的流会让 React
 * 把所有 setState 批成一次渲染，中间帧全被吞掉 —— 而中间帧正是这里唯一要验的东西，
 * 吞掉了测试就变成空转。
 */
async function streamAssistantCharacters(script: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  mockStreamNodeAssistantAPI.mockResolvedValue({
    success: true,
    stream: new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
      },
    }),
  })

  const { result } = renderHook(() =>
    useAssistantConversation({ persist: false }),
  )

  let sent!: Promise<void>
  await act(async () => {
    sent = result.current.send('看看这个', CONTEXT)
  })

  const frames: string[] = []
  for (const character of script) {
    await act(async () => {
      controller.enqueue(encoder.encode(character))
    })
    frames.push(result.current.messages[1]?.content ?? '')
  }

  await act(async () => {
    controller.close()
    await sent
  })

  return { frames, result }
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

  // 与 2026-08-21 那次（A2 的 `[[ask]]` / `[[next]]`）是同一族事故：剥引用标记的
  // 正则只认**写完的**标记，于是 `[[node`、`[[capabilit` 这些正在长出来的半截标记
  // 原样当正文渲染 —— 用户眼看着裸标记在打字机里蹦出来又消失。
  it('never renders a half-written reference marker while streaming', async () => {
    const script =
      '先看这张[[node:node-1]]，再放大[[capability:upscale:node-1]]，就行了。'

    const { frames, result } = await streamAssistantCharacters(script)

    // 脚本正文里一个方括号都没有，所以「任何一帧出现 `[`」= 半截标记漏出去了。
    expect(frames.filter((frame) => frame.includes('['))).toEqual([])
    // 防空转：第一帧只有第一个字，说明帧真的是一帧帧读到的。
    expect(frames[0]).toBe('先')
    expect(frames.at(-1)).toBe('先看这张，再放大，就行了。')

    expect(result.current.messages[1]).toMatchObject({
      content: '先看这张，再放大，就行了。',
      references: [{ nodeId: 'node-1' }],
      capabilities: [{ capability: 'upscale', nodeId: 'node-1' }],
    })
  })

  it('releases a bracket that cannot become a reference marker', async () => {
    const script = '参考 [1] 那一版就行。'

    const { frames, result } = await streamAssistantCharacters(script)

    // 扣留只针对「还可能长成标记」的尾巴，判定得出来就要立刻放行。⛔ 别把这条改成
    // 「等流结束再显示」：那会毁掉打字机，而打字机正是「传输与呈现解耦」的落点。
    expect(frames.some((frame) => frame.includes('[1]'))).toBe(true)
    expect(result.current.messages[1]).toMatchObject({
      content: script,
      references: [],
      capabilities: [],
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

  it('localizes structured provider errors from the Node assistant route', async () => {
    mockStreamNodeAssistantAPI.mockResolvedValue({
      success: false,
      error: 'raw provider error',
      errorCode: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
      i18nKey: 'errors.provider.contextLimitExceeded',
    })

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('hello', CONTEXT)
    })

    expect(result.current.error).toBe('provider.contextLimitExceeded')
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

  it('stores media on its user turn and reuses stable URLs in later turns', async () => {
    mockStreamNodeAssistantAPI
      .mockResolvedValueOnce({
        success: true,
        stream: createStream(['first answer']),
      })
      .mockResolvedValueOnce({
        success: true,
        stream: createStream(['follow-up answer']),
      })
    const mediaReference = {
      id: 'gallery-video:video-1',
      source: 'gallery' as const,
      kind: 'video' as const,
      url: 'https://cdn.example.com/reference.mp4',
      thumbnailUrl: 'https://cdn.example.com/reference.jpg',
      label: 'Camera reference',
    }

    const { result } = renderHook(() =>
      useAssistantConversation({ persist: false }),
    )

    await act(async () => {
      await result.current.send('Analyze this movement', {
        ...CONTEXT,
        references: [mediaReference],
      })
    })
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      mediaReferences: [mediaReference],
    })

    await act(async () => {
      await result.current.send('How should I adapt it?', CONTEXT)
    })

    expect(mockStreamNodeAssistantAPI).toHaveBeenLastCalledWith(
      expect.objectContaining({ references: [mediaReference] }),
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
