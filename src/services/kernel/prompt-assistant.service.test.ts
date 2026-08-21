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
  // 流式走同一个 mock —— 两条路的入参契约必须一致，分成两个 mock 就等于放任
  // 它们各自漂移，而漂移的表现是「流式的回答和缓冲的不一样」。
  llmTextStream: async function* (...a: unknown[]) {
    yield await mockLlmCompletion(...a)
  },
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
  isLlmTextContextLimitError: (error: unknown) =>
    mockIsContextLimitError(error),
}))

const mockBuildInspirationContext = vi.fn()
vi.mock('@/services/kernel/inspiration-context.service', () => ({
  buildInspirationContext: (...a: unknown[]) =>
    mockBuildInspirationContext(...a),
}))

// 检索管线（切片 1）。这里只验**接线**：回执有没有带回来、证据块有没有以带边界
// 标记的形态进用户提示、幻引用会不会被打回。管线本身在
// `services/research/*.test.ts` 里覆盖。
const mockRunResearch = vi.fn()
vi.mock('@/services/research/research-run.service', () => ({
  runResearch: (...a: unknown[]) => mockRunResearch(...a),
}))

// 视频链接路由（切片 2）只 mock **连接器本体**：`runConnector` 的熔断/永不上抛
// 是这条路依赖的行为，mock 掉就等于没验它。
const mockFetchBilibiliVideoMetadata = vi.fn()
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliVideoMetadata: (...a: unknown[]) =>
    mockFetchBilibiliVideoMetadata(...a),
}))

// 已挂载链接的平台元数据（切片 2 §4.3 收尾批）。**只 mock 取数那一半**——
// 块的渲染（围栏、handle、unknown 空态）留真的跑，否则这里断言的就只是我自己
// 写的假字符串。取数本身在 `services/video-metadata/*.test.ts` 里覆盖。
// LoRA 候选检索（切片 3）：**只 mock 打源那一半**，意图闸
// （`lora-candidate-intent`）留真的跑 —— 这里要验的正是「上一句有没有真的传到
// 闸上」，把闸也 mock 掉这条测试就变成空转（记名教训：可选 prop 漏传时编译过、
// 定向测试也过，只有抓真实入参才看得见）。
const mockSearchLoraCandidates = vi.fn()
vi.mock('@/services/lora/lora-candidates.service', () => ({
  searchLoraCandidates: (...a: unknown[]) => mockSearchLoraCandidates(...a),
}))

const mockFetchVideoLinkMetadata = vi.fn()
vi.mock(
  '@/services/video-metadata/video-metadata.service',
  async (original) => ({
    ...(await original<
      typeof import('@/services/video-metadata/video-metadata.service')
    >()),
    fetchVideoLinkMetadata: (...a: unknown[]) =>
      mockFetchVideoLinkMetadata(...a),
  }),
)

import {
  chatPromptAssistant,
  createPromptAssistantStream,
  resolveResearchMode,
} from '@/services/kernel/prompt-assistant.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { RESEARCH_MODES } from '@/constants/research'

/**
 * 跑一轮对话（流式）并把整条流读成字符串。
 *
 * ⚠ 断言的是**原始流文本**，不是剥好的正文 —— 协议块抽取已经挪到客户端
 * （`lib/assistant-protocol-blocks.ts`），服务端这条路只负责把字原样吐出来。
 * 抽取行为的验收面在那个文件的测试里。
 */
async function runGeneralTurn(
  clerkId: string,
  params: Parameters<typeof createPromptAssistantStream>[1],
): Promise<string> {
  const { stream } = await createPromptAssistantStream(clerkId, params)
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

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
    // 默认：这一轮规划器判定不需要检索（返回 null = 完全没打源）
    mockRunResearch.mockResolvedValue(null)
    // 默认：不取元数据（`[]` = 一条已挂载链接都没有 → 不出块也不加规矩）。
    mockFetchVideoLinkMetadata.mockResolvedValue([])
    // 默认：搜了也是空手（候选注入与卡面渲染在各自的测试里覆盖，这里只关心
    // 「搜没搜、拿什么词搜」）。
    mockSearchLoraCandidates.mockResolvedValue({
      candidates: [],
      query: '',
      sources: [],
    })
  })

  it('rejects a conversational turn on the buffered entry — it has exactly one home', async () => {
    await expect(
      chatPromptAssistant('clerk_1', [{ role: 'user', content: 'a cat' }]),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_CONVERSATION_IS_STREAMED' })
    expect(mockLlmCompletion).not.toHaveBeenCalled()
  })

  it('streams a normal Markdown reply verbatim in general conversation mode', async () => {
    mockLlmCompletion.mockResolvedValue(
      'Here is your prompt:\n\n```\na cat sitting under a tree, golden hour lighting\n```',
    )

    const text = await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'a cat under a tree' }],
    })

    expect(text).toBe(
      'Here is your prompt:\n\n```\na cat sitting under a tree, golden hour lighting\n```',
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

    await expect(runGeneralTurn('clerk_1', { messages })).resolves.toBe(
      '```\nrecovered prompt\n```',
    )

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
      runGeneralTurn('clerk_1', {
        messages: [{ role: 'user', content: 'keep this request' }],
      }),
    ).rejects.toThrow('provider unavailable')
    expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
  })

  it('streams plain prose unchanged when the model emits no code block', async () => {
    mockLlmCompletion.mockResolvedValue(
      'a cat sitting under a tree, golden hour lighting',
    )

    await expect(
      runGeneralTurn('clerk_1', {
        messages: [{ role: 'user', content: 'a cat under a tree' }],
      }),
    ).resolves.toContain('cat')
  })

  it('forwards stable video references to a Gemini assistant route', async () => {
    mockLlmCompletion.mockResolvedValue('I can see the camera move.')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'Analyze the movement.' }],
      references: [
        {
          id: 'video-1',
          source: 'upload',
          kind: 'video',
          url: 'https://cdn.example.com/reference.mp4',
          label: 'reference.mp4',
        },
      ],
      assistantDomain: 'image',
    })

    expect(mockLlmCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        videoData: ['https://cdn.example.com/reference.mp4'],
      }),
    )
  })

  // studio 以前**完全没有附件清单**：图片直接以 imageData[] 喂进去，模型看到
  // 一堆没名字的图，用户说「第二张」它对不上号。清单只给编号/类型/来源，不给
  // prompt（owner 2026-08-19）。
  it('把附件清单喂进 prompt，用 #n 编号且不带 label', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '看图 #2' }],
      references: [
        {
          id: 'a',
          source: 'gallery',
          kind: 'image',
          url: 'https://cdn.example.com/a.png',
          label: '一段很长的 generation prompt',
        },
        {
          id: 'b',
          source: 'upload',
          kind: 'image',
          url: 'https://cdn.example.com/b.png',
          label: 'b.png',
        },
      ],
    })

    const prompt = mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt as string
    expect(prompt).toContain('[image #1] (gallery)')
    expect(prompt).toContain('[image #2] (upload)')
    // label（可能是 generation 的 prompt）绝不进上下文
    expect(prompt).not.toContain('一段很长的 generation prompt')
  })

  it('图和视频各自从 #1 起 —— 与模型收到的两个数组对齐', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '看看' }],
      references: [
        {
          id: 'i1',
          source: 'gallery',
          kind: 'image',
          url: 'https://cdn.example.com/1.png',
          label: 'x',
        },
        {
          id: 'v1',
          source: 'upload',
          kind: 'video',
          url: 'https://cdn.example.com/1.mp4',
          label: 'y',
        },
        {
          id: 'i2',
          source: 'gallery',
          kind: 'image',
          url: 'https://cdn.example.com/2.png',
          label: 'z',
        },
      ],
    })

    const prompt = mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt as string
    expect(prompt).toContain('[image #1]')
    expect(prompt).toContain('[video #1]')
    // 插了视频**不能**把第二张图顺延成 #3
    expect(prompt).toContain('[image #2]')
    expect(prompt).not.toContain('[image #3]')
  })

  // §3.0b：owner 三次实测「助手看不见左边工作台」。根因不是字段不够，是普通对话轮
  // 根本没有这条通道 —— loraContext 只在 mode:'lora' 才发，输入框打字那轮不带。
  it('工作台状态进 prompt：挂了哪些 LoRA、权重、触发词', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '我挂了两个 LoRA 你能看到吗' }],
      workbenchState: {
        baseModelFamily: 'anima',
        loraMounts: [
          {
            name: '安可',
            type: 'character',
            triggerWords: ['encore'],
            scale: 0.95,
          },
          { name: '终末地画风', type: 'style', triggerWords: [], scale: 0.3 },
        ],
      },
    })

    const prompt = mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt as string
    expect(prompt).toContain('安可')
    expect(prompt).toContain('weight 0.95')
    expect(prompt).toContain('encore')
    expect(prompt).toContain('anima')
    // 挂上协议里那句「可见的算已知」，档位判定才会认它
    expect(prompt).toContain('never ask for it')
  })

  it('「还没选模型」这个空态也要送到', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '帮我想个画面' }],
      workbenchState: { modelSelected: false },
    })

    expect(mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt).toContain(
      'NOT SELECTED YET',
    )
  })

  it('没传工作台状态时不塞空壳', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '随便聊聊' }],
    })

    expect(mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt).not.toContain(
      'CURRENT WORKBENCH STATE',
    )
  })

  it('没有附件时不塞空清单', async () => {
    mockLlmCompletion.mockResolvedValue('ok')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '随便聊聊' }],
    })

    expect(mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt).not.toContain(
      'ATTACHED REFERENCES',
    )
  })

  it('passes requested response language into the system prompt', async () => {
    mockLlmCompletion.mockResolvedValue('```\n柔和光线下的猫\n```')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'a cat' }],
      responseLanguage: 'chinese',
    })

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
        imageData: ['data:image/png;base64,abc'],
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

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'a cat under a tree' }],
      useInspirationContext: false,
    })

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('injects inspiration context into the system prompt on the first turn', async () => {
    const INSPIRATION_BLOCK =
      '\n\n# Reference Examples (from a curated prompt library)\n... Example 1: dramatic cat scene ...'
    mockBuildInspirationContext.mockResolvedValue(INSPIRATION_BLOCK)
    mockLlmCompletion.mockResolvedValue('```\na cat in golden hour\n```')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'a cat under a tree' }],
      useInspirationContext: true,
    })

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

    await runGeneralTurn('clerk_1', {
      messages: [
        { role: 'user', content: 'a cat under a tree' },
        { role: 'assistant', content: 'A tabby cat resting beneath...' },
        { role: 'user', content: 'make it more dramatic' },
      ],
      useInspirationContext: true,
    })

    expect(mockBuildInspirationContext).not.toHaveBeenCalled()
  })

  it('prefers currentPrompt over the first message when seeding inspiration lookup', async () => {
    mockBuildInspirationContext.mockResolvedValue('')
    mockLlmCompletion.mockResolvedValue('```\nok\n```')

    await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: 'make it cinematic' }],
      currentPrompt: 'an existing prompt about a cat',
      useInspirationContext: true,
    })

    expect(mockBuildInspirationContext).toHaveBeenCalledWith(
      'an existing prompt about a cat',
    )
  })

  // ── 检索管线接线（AI 导演内核切片 1）──────────────────────────

  /** 造一份「检索发生过且拿到了 n 条证据」的结果。 */
  function researchOutcome(evidenceCount: number, runId = 'run_1') {
    return {
      receipt: {
        runId,
        grounded: evidenceCount > 0,
        status: evidenceCount > 0 ? 'succeeded' : 'no_evidence',
        perSource: [
          {
            sourceId: 'moegirl',
            status: 'ok',
            count: evidenceCount,
            tookMs: 12,
          },
        ],
        queries: ['长离 发色'],
        evidenceCount,
      },
      evidenceBlock:
        evidenceCount > 0
          ? '<<<EVIDENCE 1>>>\ntitle: 萌娘百科 · 长离\nTAGS: 粉发\n<<<END>>>'
          : '',
      items: Array.from({ length: evidenceCount }, (_, index) => ({
        kind: 'text' as const,
        id: `moegirl:${index}`,
      })),
      plan: { goal: 'analyze_character' },
    }
  }

  it('maps the legacy boolean onto the new tri-state', () => {
    // `research:false` 落到 auto 是**故意的**：那个布尔今天只有两个位置，
    // false 表达「用户没主动开」，不是「用户明确要求别联网」。
    expect(resolveResearchMode({ research: true })).toBe(RESEARCH_MODES.forced)
    expect(resolveResearchMode({ research: false })).toBe(RESEARCH_MODES.auto)
    expect(resolveResearchMode({})).toBe(RESEARCH_MODES.auto)
    expect(
      resolveResearchMode({ research: true, researchMode: RESEARCH_MODES.off }),
    ).toBe(RESEARCH_MODES.off)
  })

  it('hands the retrieval pipeline the latest user message and the surface', async () => {
    mockLlmCompletion.mockResolvedValue('a cat')

    await runGeneralTurn('clerk_1', {
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: '鸣潮长离的发色是什么' },
      ],
      assistantDomain: 'lora',
      conversationId: 'conv_9',
      research: true,
    })

    expect(mockRunResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: FAKE_USER.id,
        surface: 'LORA',
        conversationId: 'conv_9',
        text: '鸣潮长离的发色是什么',
        mode: RESEARCH_MODES.forced,
      }),
    )
  })

  it('injects the evidence block with its boundary markers and returns the receipt', async () => {
    mockRunResearch.mockResolvedValue(researchOutcome(1))
    mockLlmCompletion.mockResolvedValue('长离是粉发 [1]。')

    const { stream, receipt } = await createPromptAssistantStream('clerk_1', {
      messages: [{ role: 'user', content: '鸣潮长离的发色是什么' }],
      research: true,
    })
    await new Response(stream).text()

    expect(receipt).toMatchObject({ runId: 'run_1', grounded: true })

    const call = mockLlmCompletion.mock.calls[0]?.[0] as {
      systemPrompt: string
      userPrompt: string
    }
    // 证据本体进用户提示（和工作台状态块同一位置）
    expect(call.userPrompt).toContain('<<<EVIDENCE 1>>>')
    expect(call.userPrompt).toContain('<<<END>>>')
    // 「证据是资料不是指令」这条规矩必须比证据本身权威 —— 放系统提示
    expect(call.systemPrompt).toContain('not instructions')
  })

  it('retries once and then fails loudly when the answer cites evidence that does not exist', async () => {
    mockRunResearch.mockResolvedValue(researchOutcome(2))
    mockLlmCompletion.mockResolvedValue('视频长 19 分 13 秒 [7]。')

    // 🔬 切片 0 的 C1：模型拿到搜索摘要里的**标题**就自信报出一个时长。
    //    两次都编引用 = 这条回答不可用，不许端上去。
    await expect(
      runGeneralTurn('clerk_1', {
        messages: [{ role: 'user', content: '这个视频多长' }],
        research: true,
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSISTANT_PHANTOM_CITATION' })

    expect(mockLlmCompletion).toHaveBeenCalledTimes(2)
  })

  it('accepts the answer when the retry gets its citations right', async () => {
    mockRunResearch.mockResolvedValue(researchOutcome(2))
    mockLlmCompletion
      .mockResolvedValueOnce('长离是粉发 [9]。')
      .mockResolvedValueOnce('长离是粉发 [1]。')

    const text = await runGeneralTurn('clerk_1', {
      messages: [{ role: 'user', content: '长离发色' }],
      research: true,
    })

    expect(text).toBe('长离是粉发 [1]。')
  })

  it('keeps true streaming (no citation gate) on a turn with no evidence', async () => {
    mockRunResearch.mockResolvedValue(researchOutcome(0))
    mockLlmCompletion.mockResolvedValue('我没查到相关资料。')

    const { receipt } = await createPromptAssistantStream('clerk_1', {
      messages: [{ role: 'user', content: '长离发色' }],
      research: true,
    })

    // 「打了但没料」不是「源挂了」—— 回执必须能分辨
    expect(receipt).toMatchObject({ grounded: false, status: 'no_evidence' })
    expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
  })

  it('sends no receipt at all when the turn did not retrieve', async () => {
    mockRunResearch.mockResolvedValue(null)
    mockLlmCompletion.mockResolvedValue('a cat')

    const { receipt } = await createPromptAssistantStream('clerk_1', {
      messages: [{ role: 'user', content: 'a cat' }],
    })

    // null ≠ grounded:false —— 前者是「没检索」，后者是「检索了没拿到」
    expect(receipt).toBeNull()
  })

  // ── 视频链接路由（AI 导演内核切片 2 §4.2）──────────────────────
  //
  // 只验**接线**：链接有没有变成视频引用、平台页有没有出元数据块和引导、
  // 不支持视频的路由走的是不是既有那条错误。判别本身在 `lib/video-link.test.ts`。

  describe('视频链接路由', () => {
    /** 造一条 B站 view 接口形状的元数据证据。 */
    function bilibiliMetadataItem(overrides: Record<string, unknown> = {}) {
      return {
        kind: 'text' as const,
        id: 'bilibili:view:BV1GJ411x7h7',
        sourceId: 'bilibili' as const,
        sourceTier: 'community' as const,
        retrievedAt: '2026-08-20T10:00:00.000Z',
        title: 'bilibili · 测试稿件',
        url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
        lang: 'zh' as const,
        excerpt: '标题：测试稿件 · UP主：某个UP · 时长：3:21（201 秒）',
        ...overrides,
      }
    }

    it('把 YouTube 链接接成本轮的视频引用（免下载直传）', async () => {
      mockLlmCompletion.mockResolvedValue('这段用了推轨。')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content:
              '这个 https://www.youtube.com/watch?v=dQw4w9WgXcQ 的运镜是怎么做的',
          },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      expect(call.videoData).toEqual([
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ])
      // 挂上了就要让模型知道它挂上了，并且用**同一套 #n 编号**称呼它。
      expect(call.systemPrompt).toContain('LINKED VIDEO ATTACHED')
      expect(call.systemPrompt).toContain('[video #1]')
      expect(call.userPrompt).toContain('[video #1]')
    })

    it('把视频直链接成视频引用 —— content-type 交给下游那次 fetch 判', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: '看看 https://cdn.example.com/shot-01.mp4' },
        ],
      })

      expect(mockLlmCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          videoData: ['https://cdn.example.com/shot-01.mp4'],
        }),
      )
    })

    it('路由不支持视频时走既有的 ASSISTANT_VIDEO_UNSUPPORTED，且不白花一次检索', async () => {
      mockResolveLlmRoute.mockResolvedValue({
        ...FAKE_ROUTE,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      })

      await expect(
        runGeneralTurn('clerk_1', {
          messages: [
            {
              role: 'user',
              content: '看看 https://youtu.be/dQw4w9WgXcQ',
            },
          ],
        }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED' })

      // 能力闸排在检索之前：不支持就当场停，别先烧一次规划器 + 打源。
      expect(mockRunResearch).not.toHaveBeenCalled()
      expect(mockLlmCompletion).not.toHaveBeenCalled()
    })

    it('⚠ frames 档的路由（OpenAI）在聊天轮同样不算数 —— 自由提问要 native', async () => {
      // 能力矩阵三值化之后 OpenAI 的 video 是 `'frames'` 而不再是 `false`。
      // 聊天轮读的是 `VIDEO_ANALYSIS_TASK_TIERS[conversational] = native`：
      // 用户随时会问运镜/节奏/动作，而那三样帧序列看不见。抽帧那条走视觉线。
      mockResolveLlmRoute.mockResolvedValue({
        ...FAKE_ROUTE,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
      })

      await expect(
        runGeneralTurn('clerk_1', {
          messages: [
            { role: 'user', content: '看看 https://youtu.be/dQw4w9WgXcQ' },
          ],
        }),
      ).rejects.toMatchObject({
        errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED',
        i18nKey: 'errors.assistant.videoUnsupported',
      })
      expect(mockLlmCompletion).not.toHaveBeenCalled()
    })

    it('同一条 OpenAI 路的图片引用照常收（frames 档的前提就是能吃图）', async () => {
      mockResolveLlmRoute.mockResolvedValue({
        ...FAKE_ROUTE,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
      })

      await runGeneralTurn('clerk_1', {
        messages: [{ role: 'user', content: '看看这张' }],
        references: [
          {
            id: 'ref-image-1',
            kind: 'image',
            url: 'https://cdn.example.com/a.png',
            label: 'a.png',
          },
        ],
      })

      // 流式与缓冲共用同一个 mock（见文件头的 `llmTextStream`）。
      expect(mockLlmCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          imageData: ['https://cdn.example.com/a.png'],
        }),
      )
    })

    it('B站链接只出元数据 + 引导，绝不当视频送进去', async () => {
      mockFetchBilibiliVideoMetadata.mockResolvedValue([bilibiliMetadataItem()])
      mockLlmCompletion.mockResolvedValue('这条我看不了画面。')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content:
              '帮我分析 https://www.bilibili.com/video/BV1GJ411x7h7 这个视频',
          },
        ],
      })

      expect(mockFetchBilibiliVideoMetadata).toHaveBeenCalledWith({
        bvid: 'BV1GJ411x7h7',
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      // 元数据本体进用户提示，带边界标记（与证据块同一分工、不同围栏）
      expect(call.userPrompt).toContain('<<<VIDEO LINK 1>>>')
      expect(call.userPrompt).toContain('platform: bilibili')
      expect(call.userPrompt).toContain('UP主：某个UP')
      expect(call.userPrompt).toContain('<<<END>>>')
      // 规矩进系统提示，并且必须带那条可行的下一步
      expect(call.systemPrompt).toContain('have NOT watched these videos')
      expect(call.systemPrompt).toContain('at most 5 minutes')
      // ⛔ 平台解流器不做（已拍板边界 16）
      expect(call.videoData).toBeUndefined()
    })

    it('B站接口挂了如实说取不到，不让这一轮对话失败', async () => {
      // 熔断阈值是 3 次，这一条失败不会污染同文件后面的用例。
      mockFetchBilibiliVideoMetadata.mockRejectedValue(
        new Error('bilibili rejected the call: code=-404'),
      )
      mockLlmCompletion.mockResolvedValue('这个链接的信息我没取到。')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content: 'https://www.bilibili.com/video/BV1GJ411x7h7',
          },
        ],
      })

      const prompt = mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt as string
      expect(prompt).toContain('metadata: unavailable')
      expect(prompt).toContain('code=-404')
    })

    it('X 帖子没有连接器 —— 明说取不到，引导照给', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content: '看看 https://x.com/someone/status/1234567890',
          },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      expect(call.userPrompt).toContain('platform: x')
      expect(call.userPrompt).toContain(
        'no metadata connector for this platform',
      )
      expect(call.systemPrompt).toContain('at most 5 minutes')
      expect(call.videoData).toBeUndefined()
    })

    it('普通网页不进视频路由 —— 那是检索线的活', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content: '读一下 https://en.wikipedia.org/wiki/Cinematography',
          },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      expect(call.videoData).toBeUndefined()
      expect(call.userPrompt).not.toContain('<<<VIDEO LINK')
      expect(call.systemPrompt).not.toContain('LINKED')
    })

    it('已经拖进来的同一个视频不再因为链接送第二份', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content: '这个 https://cdn.example.com/shot-01.mp4 怎么样',
          },
        ],
        references: [
          {
            id: 'video-1',
            source: 'upload',
            kind: 'video',
            url: 'https://cdn.example.com/shot-01.mp4',
            label: 'shot-01.mp4',
          },
        ],
      })

      expect(mockLlmCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          videoData: ['https://cdn.example.com/shot-01.mp4'],
        }),
      )
    })

    it('撞上 8 上限的链接不静默丢弃 —— 系统提示里点名说没挂上', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content: '再看这个 https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
        ],
        references: Array.from({ length: 8 }, (_, index) => ({
          id: `img-${index}`,
          source: 'upload' as const,
          kind: 'image' as const,
          url: `https://cdn.example.com/${index}.png`,
          label: `${index}.png`,
        })),
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        videoData?: string[]
      }
      expect(call.videoData).toBeUndefined()
      expect(call.systemPrompt).toContain('LINKED VIDEO NOT ATTACHED')
      expect(call.systemPrompt).toContain(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      )
    })

    // 🔬 2026-08-21 受控复现（真调 Gemini 一次）：视频已经在上下文里（实收
    // 101,923 个视频 token），同轮却还有一条 url_reader 读回来的「401
    // Unauthorized」——模型据此宣布自己拿不到视频，报出记忆里的 19:13（真值
    // 18:40）。检索线那半边由 `research-intent` 修（视频链接不再进 url_reader）；
    // 这里守的是模型侧那半边：「页面读失败」≠「视频看不了」，且不许拿记忆填。
    it('挂上视频时把「读页面失败不等于看不了视频」写进系统提示', async () => {
      mockLlmCompletion.mockResolvedValue('18 分 40 秒。')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content:
              '这个视频有多长？https://www.youtube.com/watch?v=aircAruvnKk',
          },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        videoData?: string[]
      }
      expect(call.videoData).toEqual([
        'https://www.youtube.com/watch?v=aircAruvnKk',
      ])
      expect(call.systemPrompt).toContain(
        'says NOTHING about the attached video',
      )
      expect(call.systemPrompt).toContain('Never fill the gap from memory')
    })

    it('视频取不到时大声失败 —— 不把结构化错误吞成一段散文', async () => {
      // provider 侧把「fileUri 取不到」翻译成 ASSISTANT_VIDEO_UNREACHABLE（403
      // → 422，见 llm-text.service）。这一轮必须原样断流，绝不能让模型接着
      // 用记忆把答案编完 —— 那正是本批要消灭的失败形状。
      const unreachable = Object.assign(new Error('video unreachable'), {
        errorCode: 'ASSISTANT_VIDEO_UNREACHABLE',
        httpStatus: 422,
      })
      mockLlmCompletion.mockRejectedValue(unreachable)

      await expect(
        runGeneralTurn('clerk_1', {
          messages: [
            {
              role: 'user',
              content: '这个视频讲了什么 https://youtu.be/dQw4w9WgXcQ',
            },
          ],
        }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VIDEO_UNREACHABLE' })

      // 不重试：这不是超上下文，重试只是把同一个 403 再买一次。
      expect(mockLlmCompletion).toHaveBeenCalledTimes(1)
    })
  })

  // ── 视频元数据一并取回（切片 2 §4.3 收尾批）─────────────────────
  //
  // 🔬 起因是 08-21 那道题剩下的半边：路由抢夺修完后视频真的挂上了、画面也
  // 真看得见（追问逐秒描述准确），**时长仍答 19:13**（真值 18:40），同设置另
  // 一次答 18:41。时长是元数据问题不是画面问题 —— 视觉模型按帧采样数不准总长。
  // 所以挂视频时一并取平台元数据当**结构化事实**注入，让模型有可引的来源。

  describe('视频元数据一并取回', () => {
    /** 造一条取数成功的元数据（形状与 `VideoLinkMetadata` 一致）。 */
    function metadataEntry(overrides: Record<string, unknown> = {}) {
      return {
        handle: '#1',
        url: 'https://www.youtube.com/watch?v=aircAruvnKk',
        title: 'But what is a neural network? | Deep learning chapter 1',
        author: '3Blue1Brown',
        durationSeconds: 1120,
        publishedAt: '2017-10-05',
        sources: ['youtube oembed', 'youtube watch page'],
        ...overrides,
      }
    }

    it('挂 YouTube 链接时一并取元数据，时长以结构化事实进用户提示', async () => {
      mockFetchVideoLinkMetadata.mockResolvedValue([metadataEntry()])
      mockLlmCompletion.mockResolvedValue('YouTube 报的时长是 18:40。')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content:
              '这个视频有多长？https://www.youtube.com/watch?v=aircAruvnKk',
          },
        ],
      })

      // 取数拿到的是**已挂上去的那条**，handle 与附件清单同源。
      expect(mockFetchVideoLinkMetadata).toHaveBeenCalledWith([
        { handle: '#1', url: 'https://www.youtube.com/watch?v=aircAruvnKk' },
      ])

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      // 视频本体照走，元数据是**附加**不是替代。
      expect(call.videoData).toEqual([
        'https://www.youtube.com/watch?v=aircAruvnKk',
      ])
      expect(call.userPrompt).toContain('<<<VIDEO METADATA 1>>>')
      expect(call.userPrompt).toContain('handle: [video #1]')
      expect(call.userPrompt).toContain('duration: 18:40 (1120 seconds)')
      expect(call.userPrompt).toContain('published: 2017-10-05')
      expect(call.systemPrompt).toContain('LINKED VIDEO METADATA RULES')
    })

    it('⭐ 规矩必须写清「平台报的时长胜过从帧里数出来的」', async () => {
      mockFetchVideoLinkMetadata.mockResolvedValue([metadataEntry()])
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: 'https://youtu.be/aircAruvnKk 多长' },
        ],
      })

      const { systemPrompt } = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
      }
      // 元数据这条必须排在「数字只能来自画面」之后 —— 顺序颠倒会读成把例外收回去。
      expect(
        systemPrompt.indexOf('LINKED VIDEO METADATA RULES'),
      ).toBeGreaterThan(systemPrompt.indexOf('LINKED VIDEO ATTACHED'))
      expect(systemPrompt).toContain('the metadata WINS')
      expect(systemPrompt).toContain('counted from frames is a guess')
    })

    it('时长取不到时块里**明写 unknown** —— 省略等于让模型接着猜', async () => {
      mockFetchVideoLinkMetadata.mockResolvedValue([
        {
          handle: '#1',
          url: 'https://cdn.example.com/shot-01.mp4',
          sources: [],
        },
      ])
      mockLlmCompletion.mockResolvedValue('我不知道这条有多长。')

      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: '看看 https://cdn.example.com/shot-01.mp4' },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
        videoData?: string[]
      }
      expect(call.userPrompt).toContain('duration: unknown')
      expect(call.userPrompt).toContain('source: unavailable')
      // ⭐ 取数失败**不阻断视频分析**：视频照挂、这一轮照走完。
      expect(call.videoData).toEqual(['https://cdn.example.com/shot-01.mp4'])
      expect(call.systemPrompt).toContain('genuinely unknown')
    })

    it('平台页与已挂载链接**各用各的围栏** —— 别把「你没看过」扣到正看着的视频上', async () => {
      mockFetchBilibiliVideoMetadata.mockResolvedValue([
        {
          kind: 'text' as const,
          id: 'bilibili:view:BV1GJ411x7h7',
          sourceId: 'bilibili' as const,
          sourceTier: 'community' as const,
          retrievedAt: '2026-08-20T10:00:00.000Z',
          title: 'bilibili · 测试稿件',
          url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
          lang: 'zh' as const,
          excerpt: '标题：测试稿件 · UP主：某个UP · 时长：3:21（201 秒）',
        },
      ])
      mockFetchVideoLinkMetadata.mockResolvedValue([metadataEntry()])
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [
          {
            role: 'user',
            content:
              '对比 https://www.bilibili.com/video/BV1GJ411x7h7 和 https://www.youtube.com/watch?v=aircAruvnKk',
          },
        ],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
      }
      expect(call.userPrompt).toContain('<<<VIDEO LINK 1>>>')
      expect(call.userPrompt).toContain('<<<VIDEO METADATA 1>>>')
      expect(call.systemPrompt).toContain('LINKED PLATFORM VIDEO RULES')
      expect(call.systemPrompt).toContain('LINKED VIDEO METADATA RULES')
      // 两套围栏都不进 `[n]` 引用池 —— 混进去引用闸就对不上账。
      expect(call.userPrompt).not.toContain('<<<EVIDENCE')
    })

    it('这一轮没有已挂载链接时既不出块也不加规矩', async () => {
      mockLlmCompletion.mockResolvedValue('ok')

      await runGeneralTurn('clerk_1', {
        messages: [{ role: 'user', content: '帮我写个提示词' }],
      })

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
        userPrompt: string
      }
      expect(mockFetchVideoLinkMetadata).toHaveBeenCalledWith([])
      expect(call.userPrompt).not.toContain('<<<VIDEO METADATA')
      expect(call.systemPrompt).not.toContain('LINKED VIDEO METADATA RULES')
    })
  })

  // ── 附件上限 × 能力闸（AI 导演内核 §4.4 三个洞的回归）─────────────
  //
  // 三条各钉一个洞：① 截断排在能力校验之前 → 第 9 个附件连该弹的错都不弹；
  // ② legacy 参考图不进 hasImage 统计却被 unshift 进 imageData → 绕过能力闸让
  // provider 抛英文裸错；③ 超量静默丢弃 → 用户以为它看过。
  //
  // ⚠ 三条都直接调服务，**故意绕过路由那层 Zod**（`PromptAssistantRequestSchema`
  // 把 references 卡在 8）—— 这里验的正是「schema 之外还有没有第二道自洽」，
  // 让上限的主人不只有一个远在天边的 schema。
  describe('附件上限与能力闸', () => {
    /** 造 n 张图片引用。 */
    function imageReferences(count: number) {
      return Array.from({ length: count }, (_, index) => ({
        id: `img-${index}`,
        source: 'upload' as const,
        kind: 'image' as const,
        url: `https://cdn.example.com/${index}.png`,
        label: `${index}.png`,
      }))
    }

    it('第 9 个附件是视频、路由又不支持视频 —— 照样弹 ASSISTANT_VIDEO_UNSUPPORTED', async () => {
      // 洞 1。OpenAI 支持图不支持视频，所以「第 9 个是视频」是唯一的失败原因：
      // 校验一旦排在截断之后，这条视频先被削掉，错也跟着消失。
      mockResolveLlmRoute.mockResolvedValue({
        ...FAKE_ROUTE,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
      })
      mockLlmCompletion.mockResolvedValue('ok')

      await expect(
        runGeneralTurn('clerk_1', {
          messages: [{ role: 'user', content: '看看这些' }],
          references: [
            ...imageReferences(8),
            {
              id: 'v9',
              source: 'upload' as const,
              kind: 'video' as const,
              url: 'https://cdn.example.com/9.mp4',
              label: '9.mp4',
            },
          ],
        }),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_VIDEO_UNSUPPORTED' })

      expect(mockLlmCompletion).not.toHaveBeenCalled()
      expect(mockRunResearch).not.toHaveBeenCalled()
    })

    it('只有 legacy 参考图 + 不支持图的路由 —— 走 ASSISTANT_IMAGE_UNSUPPORTED 而不是让 provider 裸抛', async () => {
      // 洞 2。DeepSeek 是纯文本路由；legacy 参考图照样会被 unshift 进 imageData，
      // 不进 hasImage 统计就等于绕过这道闸，用户拿到的是一句英文裸错。
      mockResolveLlmRoute.mockResolvedValue({
        ...FAKE_ROUTE,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      })
      mockLlmCompletion.mockResolvedValue('```\nok\n```')

      await expect(
        chatPromptAssistant(
          'clerk_1',
          [{ role: 'user', content: '按这张图的配色来' }],
          undefined,
          'https://cdn.example.com/studio-reference.png',
          undefined,
          undefined,
          'english',
          'lora',
        ),
      ).rejects.toMatchObject({ errorCode: 'ASSISTANT_IMAGE_UNSUPPORTED' })

      expect(mockLlmCompletion).not.toHaveBeenCalled()
      expect(mockRunResearch).not.toHaveBeenCalled()
    })

    it('超量不抛错：只送上限内那些，丢了几个写进附件清单并回给调用方', async () => {
      // 洞 3。截断是合理保护 —— 多传两张不该让整轮失败；但静默丢弃的表现是
      // 「助手全靠猜」，而用户以为它看过。
      mockLlmCompletion.mockResolvedValue('ok')

      const result = await createPromptAssistantStream('clerk_1', {
        messages: [{ role: 'user', content: '看看这 10 张' }],
        references: imageReferences(10),
      })
      await new Response(result.stream).text()

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        imageData?: string[]
        userPrompt: string
      }
      expect(call.imageData).toHaveLength(8)
      expect(call.userPrompt).toContain('2 more attachment(s)')
      // 清单编号不许跑到模型其实没收到的那两张上
      expect(call.userPrompt).toContain('[image #8]')
      expect(call.userPrompt).not.toContain('[image #9]')
      // (a) 调用方侧拿得到结构化的「丢了几个」，不用去 parse 提示词
      expect(result.droppedReferenceCount).toBe(2)
    })

    it('缓冲轮把 droppedReferenceCount 带进响应体', async () => {
      mockLlmCompletion.mockResolvedValue('```\nok\n```')

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: '转成 tags' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        undefined,
        imageReferences(10),
      )

      expect(result.droppedReferenceCount).toBe(2)
    })

    it('没丢就不带这个字段，附件清单里也不出现超量那行', async () => {
      mockLlmCompletion.mockResolvedValue('```\nok\n```')

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: '转成 tags' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'english',
        'lora',
        undefined,
        undefined,
        undefined,
        imageReferences(2),
      )

      // 老客户端忽略新键即可；没丢时连键都没有，不是 0
      expect(result.droppedReferenceCount).toBeUndefined()
      expect(mockLlmCompletion.mock.calls[0]?.[0]?.userPrompt).not.toContain(
        'exceeded the',
      )
    })
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

    it('translates the note field to the requested response language', async () => {
      mockLlmCompletion.mockResolvedValue(
        JSON.stringify({
          positive: ['1girl'],
          negative: [],
          note: '身份交给了 LoRA。',
        }),
      )

      const result = await chatPromptAssistant(
        'clerk_1',
        [{ role: 'user', content: '雪地里的少女' }],
        undefined,
        undefined,
        undefined,
        undefined,
        'chinese',
        'lora',
        undefined,
        undefined,
        { mounts: [], trayTags: [] },
      )

      const call = mockLlmCompletion.mock.calls[0]?.[0] as {
        systemPrompt: string
      }
      expect(call.systemPrompt).toContain('Simplified Chinese')
      expect(call.systemPrompt).toContain('Always English regardless')
      expect(result.lora?.note).toBe('身份交给了 LoRA。')
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

  // 2026-08-22：意图闸补了「续问态」之后，这里守的是**接线**那一半 ——
  // 纯函数改对了但上一句没传进去，编译过、`lora-candidate-intent.test.ts` 也全绿，
  // 而真机表现是「一点没变」。判据只能是抓 `searchLoraCandidates` 的真实入参。
  describe('LoRA 候选检索 · 上一句要传到闸上', () => {
    it('上一轮问了 LoRA、这一轮只给关键词 → 用关键词打源', async () => {
      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: '推荐一个适合画水彩插画风格的 LoRA' },
          { role: 'assistant', content: '你想要哪种水彩？告诉我关键词。' },
          { role: 'user', content: '重新搜，关键词用 illustrious style' },
        ],
      })

      expect(mockSearchLoraCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('illustrious style'),
        }),
      )
    })

    it('⛔ 防空转：同一句话单独出现（没有上一轮）时不打源', async () => {
      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: '重新搜，关键词用 illustrious style' },
        ],
      })

      expect(mockSearchLoraCandidates).not.toHaveBeenCalled()
    })

    it('⚠ 取的是上一条**用户**消息，不是 messages 里往回数第三条', async () => {
      // 中间隔着几条助手消息是会变的（失败轮、重试轮都会改变间隔数）。
      // 数下标的写法在这条用例上会取到助手那句，于是续问态失效。
      await runGeneralTurn('clerk_1', {
        messages: [
          { role: 'user', content: '推荐一个适合画水彩插画风格的 LoRA' },
          { role: 'assistant', content: '先说结论：' },
          { role: 'assistant', content: '你想要哪种水彩？告诉我关键词。' },
          { role: 'user', content: '水彩插画' },
        ],
      })

      expect(mockSearchLoraCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ query: '水彩插画' }),
      )
    })
  })
})
