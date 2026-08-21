import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

vi.mock('@/lib/api-client', () => ({
  chatPromptAssistantAPI: vi.fn(),
  streamPromptAssistantAPI: vi.fn(),
  getAssistantConversationAPI: vi.fn().mockResolvedValue({ success: false }),
  listAssistantConversationsAPI: vi.fn().mockResolvedValue({ success: false }),
  upsertAssistantConversationAPI: vi.fn().mockResolvedValue({ success: false }),
}))

import { streamPromptAssistantAPI } from '@/lib/api-client'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { usePromptAssistant } from './use-prompt-assistant'

/** 把若干段文本做成一条真 ReadableStream，模拟 provider 逐段吐字。 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function lastAssistantContent(messages: { role: string; content: string }[]) {
  return messages.filter((m) => m.role === 'assistant').at(-1)?.content ?? ''
}

describe('usePromptAssistant · 流式对话轮', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('把流渲染成助手消息，正文逐步长出来后收敛到全文', async () => {
    const body = '第一段。第二段。第三段。'
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf([body]),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(lastAssistantContent(result.current.messages)).toBe(body)
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('协议块被剥掉，ask / next 变成结构化数据而不是正文', async () => {
    const raw = [
      '正文一句。\n\n',
      '[[ask]]\n{"questions":[{"id":"q1","question":"要什么主体？","options":[{"id":"o1","label":"人物"}],"multiSelect":false,"allowCustom":true,"allowSkip":false}]}\n[[/ask]]\n\n',
      '[[next]]\n{"satisfied":"就这样","adjust":"再调"}\n[[/next]]',
    ]
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf(raw),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const assistant = result.current.messages.at(-1)
    expect(assistant?.content).toBe('正文一句。')
    // 标记文本绝不能作为正文打出来
    expect(assistant?.content).not.toContain('[[ask]]')
    expect(assistant?.content).not.toContain('questions')
    expect(assistant?.ask).toHaveLength(1)
    expect(assistant?.next?.satisfied).toBe('就这样')
  })

  it('isThinking 只在第一个字出现之前为真', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf(['有内容了']),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })
    expect(result.current.isThinking).toBe(false)

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(lastAssistantContent(result.current.messages)).toBe('有内容了')
    })
    // 有正文之后就不该再是「思考中」
    expect(result.current.isThinking).toBe(false)
  })

  it('流中途挂掉：保留已打出来的文字，再补错误尾巴', async () => {
    const encoder = new TextEncoder()
    // ⚠ 不能 start 里 enqueue 完直接 error —— `error()` 会**清空**已入队的 chunk
    // （Streams 规范），那样这段文字根本没送达，测的就不是「送达后中断」了。
    // 用 pull：第一拍给字，第二拍才炸。
    let pulls = 0
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1
          if (pulls === 1) {
            controller.enqueue(encoder.encode('已经写了半句'))
            return
          }
          controller.error(new Error('upstream exploded'))
        },
      }),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(result.current.errorCode).toBe('ASSISTANT_STREAM_INTERRUPTED')
    })
    // 关键：已流出的文字**没有**被清空
    expect(lastAssistantContent(result.current.messages)).toContain(
      '已经写了半句',
    )
    expect(result.current.error).toContain('upstream exploded')
    expect(result.current.isLoading).toBe(false)
  })

  it('超长的附件 label 在发出前夹到上限 —— 否则整条请求 400', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf(['好的']),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    // 素材选择器拿 generation 的完整 prompt 当 label，随便就超 160；历史会话里
    // 也已经存着这种超长 label。2026-08-18 真机撞到「Invalid request body」。
    await act(async () => {
      await result.current.send('看这张图', {
        references: [
          {
            id: 'gallery-image:1',
            source: 'gallery',
            kind: 'image',
            url: 'https://cdn.example.com/a.png',
            label: '长'.repeat(400),
          },
        ],
      })
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const sent = vi.mocked(streamPromptAssistantAPI).mock.calls[0]?.[0]
    expect(sent?.references?.[0]?.label.length).toBe(
      ASSISTANT_MEDIA_LIMITS.maxLabelLength,
    )
  })

  it('空流报错而不是留一条空助手气泡', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf(['']),
      research: null,
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(result.current.errorCode).toBe('ASSISTANT_EMPTY_STREAM')
    })
    expect(result.current.messages.some((m) => m.role === 'assistant')).toBe(
      false,
    )
  })
})
