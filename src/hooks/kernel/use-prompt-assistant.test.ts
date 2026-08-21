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

import {
  getAssistantConversationAPI,
  streamPromptAssistantAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { narrowLoraPicksToCandidates } from '@/lib/assistant-protocol-blocks'
import type { LoraCandidate } from '@/types/lora-candidate'
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
      loraCandidates: null,
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
      loraCandidates: null,
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
      loraCandidates: null,
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
      loraCandidates: null,
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
      loraCandidates: null,
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
      loraCandidates: null,
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

// ─── 切片 3：LoRA 推荐的下发与持久化 ────────────────────────────────

function loraCandidate(id: string): LoraCandidate {
  return {
    candidateId: id,
    source: 'civitai',
    name: `候选 ${id}`,
    author: 'creator',
    license: {
      label: null,
      commercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    baseModelFamily: 'Illustrious',
    type: 'subject',
    triggerWords: ['changli'],
    sampleImageUrls: [],
    fileSizeBytes: 1024,
    pageUrl: `https://civitai.com/models/${id}`,
    downloads: 10,
    metadataCompleteness: 'complete',
    importable: true,
    alreadyMounted: false,
    alreadyImported: false,
    importPayload: {
      name: `候选 ${id}`,
      triggerWord: 'changli',
      loraUrl: `https://civitai.com/api/download/models/${id}`,
      type: 'subject',
      baseModelFamily: 'Illustrious',
      provider: 'civitai',
      coverImageUrl: null,
      recommendedPrompt: null,
      fileHashAutoV3: null,
      sourceSnapshot: {
        source: 'civitai',
        author: 'creator',
        license: {
          label: null,
          commercialUse: ['Image'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        pageUrl: `https://civitai.com/models/${id}`,
        revision: null,
        retrievedAt: '2026-08-21T09:12:33.123Z',
        fileSizeBytes: 1024,
        metadataCompleteness: 'complete',
      },
    },
  }
}

describe('usePromptAssistant · LoRA 推荐（切片 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('候选走响应头到达，`[[lora]]` 里只有 id —— 事实来自候选而不是正文', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf([
        '这几把比较贴。\n\n',
        '[[lora]]\n{"picks":[{"candidateId":"civitai:1:1","reason":"画风一致","suggestedWeight":0.7}]}\n[[/lora]]',
      ]),
      research: null,
      loraCandidates: {
        candidates: [
          loraCandidate('civitai:1:1'),
          loraCandidate('civitai:2:2'),
        ],
        query: '长离 lora',
        sources: [{ source: 'civitai', status: 'ok', count: 2, tookMs: 10 }],
      },
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('给我找个长离的 LoRA')
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const assistant = result.current.messages.at(-1)
    // 标记不许作为正文打出来
    expect(assistant?.content).toBe('这几把比较贴。')
    expect(assistant?.content).not.toContain('[[lora]]')
    expect(assistant?.loraPicks).toHaveLength(1)
    // 本轮候选整批都在（配对时才收窄到被挑中的那几条）
    expect(assistant?.loraCandidates).toHaveLength(2)

    const resolved = narrowLoraPicksToCandidates(
      assistant?.loraPicks,
      assistant?.loraCandidates,
    )
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.candidate.name).toBe('候选 civitai:1:1')
    expect(resolved[0]?.pick.reason).toBe('画风一致')
  })

  it('落库只存被挑中的那几条候选，⛔ 不把整轮 6 条都塞进历史', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      stream: streamOf([
        '推荐这把。',
        '[[lora]]\n{"picks":[{"candidateId":"civitai:1:1","reason":"画风一致"},{"candidateId":"civitai:9:9","reason":"编的 id"}]}\n[[/lora]]',
      ]),
      research: null,
      loraCandidates: {
        candidates: [
          loraCandidate('civitai:1:1'),
          loraCandidate('civitai:2:2'),
        ],
        query: '长离 lora',
        sources: [{ source: 'civitai', status: 'ok', count: 2, tookMs: 10 }],
      },
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('给我找个长离的 LoRA')
    })

    await waitFor(() => {
      expect(upsertAssistantConversationAPI).toHaveBeenCalled()
    })

    const persisted = vi
      .mocked(upsertAssistantConversationAPI)
      .mock.calls.at(-1)?.[0]
    const storedAssistant = persisted?.messages.at(-1)
    expect(storedAssistant?.loraCandidates).toHaveLength(1)
    expect(storedAssistant?.loraCandidates?.[0]?.candidateId).toBe(
      'civitai:1:1',
    )
    // 命不中本轮候选的 pick（模型编的 id）在落库这一层就被挡掉
    expect(storedAssistant?.loraPicks).toHaveLength(1)
    // 导入载荷必须跟着落库 —— 三轮前的推荐今天点导入还要用它
    expect(storedAssistant?.loraCandidates?.[0]?.importPayload).not.toBeNull()
  })

  it('刷新之后卡能重建：存的两个字段回读后仍然配得上对', async () => {
    vi.mocked(getAssistantConversationAPI).mockResolvedValue({
      success: true,
      data: {
        id: 'conv-1',
        surface: 'VIDEO_STUDIO',
        projectId: null,
        title: null,
        createdAt: '2026-08-21T09:00:00.000Z',
        updatedAt: '2026-08-21T09:00:00.000Z',
        messages: [
          { role: 'user', content: '给我找个长离的 LoRA' },
          {
            role: 'assistant',
            content: '推荐这把。',
            loraPicks: [{ candidateId: 'civitai:1:1', reason: '画风一致' }],
            loraCandidates: [loraCandidate('civitai:1:1')],
          },
        ],
      },
    })

    const { result } = renderHook(() => usePromptAssistant('VIDEO_STUDIO'))

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    const assistant = result.current.messages.at(-1)
    const resolved = narrowLoraPicksToCandidates(
      assistant?.loraPicks,
      assistant?.loraCandidates,
    )
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.candidate.importPayload?.loraUrl).toBe(
      'https://civitai.com/api/download/models/civitai:1:1',
    )
  })
})
