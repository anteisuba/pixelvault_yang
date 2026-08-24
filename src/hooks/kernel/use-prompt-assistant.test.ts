import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ⚠ 真实的 next-intl `t` 带 `has()`，`getApiErrorMessage` 靠它判断 i18nKey 解不
// 解得出来。mock 漏了它 = 走到 i18nKey 那条路径时 `t.has is not a function`。
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => false }),
}))

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
import type {
  LoraCandidate,
  LoraCandidateSearchResult,
} from '@/types/lora-candidate'
import type { AssistantStreamMessage } from '@/lib/assistant-stream-client'
import { usePromptAssistant } from './use-prompt-assistant'

/**
 * 把若干段正文做成**帧流**，模拟服务端逐段吐字。
 *
 * ⚠ 换帧协议前这里造的是 `ReadableStream<Uint8Array>`，回执与候选是函数返回值上
 * 的字段（它们当时走响应头）。现在它们是流里的帧，且服务端保证排在第一个 `text`
 * 之前 —— 这个 helper 的产出顺序就是那份保证的镜像。
 */
async function* eventsOf(
  chunks: string[],
  extras: { lora?: LoraCandidateSearchResult } = {},
): AsyncIterable<AssistantStreamMessage> {
  if (extras.lora) yield { type: 'lora', candidates: extras.lora }
  for (const delta of chunks) yield { type: 'text', delta }
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
      events: eventsOf([body]),
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
      events: eventsOf(raw),
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
      events: eventsOf(['有内容了']),
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

  it('连接断了（帧流直接抛）：保留已打出来的文字，再补错误尾巴', async () => {
    async function* explodingEvents(): AsyncIterable<AssistantStreamMessage> {
      yield { type: 'text', delta: '已经写了半句' }
      throw new Error('upstream exploded')
    }
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      events: explodingEvents(),
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

  it('服务端补的 error 帧：错误码活着到 UI，不再退化成一句读流异常', async () => {
    // ⭐ 这是换帧协议**顺带修好**的老毛病。裸文本流时中途失败只能
    //    `controller.error()`，客户端拿到的是一个没有 errorCode / i18nKey 的异常，
    //    于是「provider 超时」和「网断了」在 UI 上长得一模一样 —— 上面那条测的
    //    正是后者。这条测前者。
    async function* failingEvents(): AsyncIterable<AssistantStreamMessage> {
      yield { type: 'text', delta: '已经写了半句' }
      yield {
        type: 'error',
        error: 'The selected provider did not answer in time.',
        errorCode: 'PROVIDER_TIMEOUT',
        i18nKey: 'errors.provider.timeout',
      }
    }
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      events: failingEvents(),
    })

    const { result } = renderHook(() => usePromptAssistant('IMAGE_STUDIO'))
    act(() => {
      result.current.clear()
    })

    await act(async () => {
      await result.current.send('写点什么')
    })

    await waitFor(() => {
      expect(result.current.errorCode).toBe('PROVIDER_TIMEOUT')
    })
    // 已流出的文字同样不被清空 —— 与「连接断了」那条同一条收尾纪律。
    expect(lastAssistantContent(result.current.messages)).toContain(
      '已经写了半句',
    )
    expect(result.current.isLoading).toBe(false)
  })

  it('超长的附件 label 在发出前夹到上限 —— 否则整条请求 400', async () => {
    vi.mocked(streamPromptAssistantAPI).mockResolvedValue({
      success: true,
      events: eventsOf(['好的']),
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
      events: eventsOf(['']),
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
      events: eventsOf(
        [
          '这几把比较贴。\n\n',
          '[[lora]]\n{"picks":[{"candidateId":"civitai:1:1","reason":"画风一致","suggestedWeight":0.7}]}\n[[/lora]]',
        ],
        {
          lora: {
            candidates: [
              loraCandidate('civitai:1:1'),
              loraCandidate('civitai:2:2'),
            ],
            query: '长离 lora',
            sources: [
              { source: 'civitai', status: 'ok', count: 2, tookMs: 10 },
            ],
          },
        },
      ),
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
      events: eventsOf(
        [
          '推荐这把。',
          '[[lora]]\n{"picks":[{"candidateId":"civitai:1:1","reason":"画风一致"},{"candidateId":"civitai:9:9","reason":"编的 id"}]}\n[[/lora]]',
        ],
        {
          lora: {
            candidates: [
              loraCandidate('civitai:1:1'),
              loraCandidate('civitai:2:2'),
            ],
            query: '长离 lora',
            sources: [
              { source: 'civitai', status: 'ok', count: 2, tookMs: 10 },
            ],
          },
        },
      ),
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
