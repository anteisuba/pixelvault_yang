import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
  isLlmTextContextLimitError: () => false,
}))

const mockGetPublicGenerationPage = vi.fn()
vi.mock('@/services/generation.service', () => ({
  getPublicGenerationPage: (...args: unknown[]) =>
    mockGetPublicGenerationPage(...args),
}))

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import {
  AssistantOperatorEventSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'

const SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'flux-pro', label: 'FLUX Pro' },
  ],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

function buildRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    messages: [{ role: 'user', content: '帮我把这张海报配好' }],
    domain: 'image',
    snapshot: SNAPSHOT,
    ...overrides,
  }
}

/** 模型按顺序吐出来的几轮回复。 */
function queueTurns(...turns: unknown[]): void {
  mockLlmTextCompletion.mockReset()
  for (const turn of turns) {
    mockLlmTextCompletion.mockResolvedValueOnce(
      typeof turn === 'string' ? turn : JSON.stringify(turn),
    )
  }
  // 队列吐完之后一律收尾，免得循环撞到 undefined。
  mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ finished: true }))
}

async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) {
    // 每一个事件都必须过自己的契约 —— service 说了不算，schema 说了算。
    expect(AssistantOperatorEventSchema.safeParse(event).success).toBe(true)
    out.push(event)
  }
  return out
}

function stepsOf(events: AssistantOperatorEvent[]) {
  return events
    .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.step)
    .map((event) => (event as { step: Record<string, unknown> }).step)
}

function lastUserPrompt(): string {
  const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
    userPrompt: string
  }
  return call.userPrompt
}

beforeEach(() => {
  vi.clearAllMocks()
  // ⚠ `clearAllMocks` 只清调用记录，**不清实现，也不清没被消费掉的
  //    `mockResolvedValueOnce` 队列**。打断类用例常常在队列吐完之前就返回，
  //    剩下的那条会漏进下一个用例并压过它自己的 `mockImplementation`
  //    （本文件真踩过一次，表现是「abort 了却收到 done」）。
  mockLlmTextCompletion.mockReset()
  mockEnsureUser.mockResolvedValue({ id: 'user-db-1' })
  mockResolveLlmTextRoute.mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
    apiKey: 'test-key',
  })
  mockGetPublicGenerationPage.mockResolvedValue({
    generations: [],
    total: 0,
    hasMore: false,
    nextCursor: null,
  })
})

describe('工具环 · 逐事件顺序', () => {
  it('计划 → running → done → done，改动型 step 带着能撤回原值的 inverse', async () => {
    queueTurns(
      {
        plan: ['写提示词', '预填生成键'],
        message: '这就来',
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'write the prompt',
          reason: 'the field is empty',
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])

    const [running, done] = stepsOf(events)
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    // 同一步共用一个 id —— 客户端按 id 覆盖而不是追加。
    expect(running.id).toBe(done.id)
    expect(done.payload).toEqual({
      value: 'a girl under a red umbrella',
      mode: 'replace',
    })
    expect(done.inverse).toEqual({ value: '' })
  })

  it('⭐ 连改两次时，第二次的 inverse 撤回到第一次写完之后的值', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'first',
          args: { value: 'first draft' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'second',
          args: { value: 'second draft' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const doneSteps = stepsOf(events).filter(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(doneSteps[0].inverse).toEqual({ value: '' })
    expect(doneSteps[1].inverse).toEqual({ value: 'first draft' })
  })

  it('模型不给 tool 就直接收尾', async () => {
    queueTurns({ message: '你想要什么风格？' })
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
    expect(stepsOf(events)).toHaveLength(0)
  })

  it('围栏包着的 JSON 照样读得出来', async () => {
    queueTurns('```json\n{"finished":true,"message":"好"}\n```')
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
  })

  it('连着两轮读不出 JSON 就大声失败，而不是把步数烧完', async () => {
    mockLlmTextCompletion.mockResolvedValue('抱歉，我说点别的。')
    await expect(
      collect(runAssistantOperator('clerk-1', buildRequest())),
    ).rejects.toThrow(/JSON/)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
  })

  it('撞到步数上限时停下来并说出理由，不自动续跑（台账 AH：没有幂等键）', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'look again',
          args: {},
        },
      }),
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.at(-1)).toEqual({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(
      ASSISTANT_OPERATOR_LIMITS.maxSteps,
    )
  })
})

describe('read_state', () => {
  it('读的是请求里的快照，不查库；负面框缺席时明说没有这个控件', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read the form',
          args: {},
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, negativePrompt: undefined },
        }),
      ),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    const digest = (done?.result as { digest: string }).digest
    expect(digest).toContain('NO NEGATIVE PROMPT FIELD')
    expect(digest).toContain('Models you can switch to')
    expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
  })
})

describe('search_assets', () => {
  it('只查这个用户自己的库，类型收在可挂的两种里', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-1',
          url: 'https://cdn.example.test/1.png',
          thumbnailUrl: 'https://cdn.example.test/1-thumb.png',
          outputType: 'IMAGE',
          prompt: 'red umbrella in the rain',
          model: 'seedream-4',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        // 没有 url 的那条（还在跑 / 失败了）不该端给模型
        {
          id: 'gen-2',
          url: null,
          outputType: 'IMAGE',
          prompt: 'half done',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ],
      total: 7,
      hasMore: false,
      nextCursor: null,
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search the library',
          args: { query: 'umbrella', kind: 'image', limit: 6 },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(mockGetPublicGenerationPage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-db-1',
        search: 'umbrella',
        type: ['image'],
        limit: 6,
      }),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    const result = done?.result as {
      totalFound: number
      assets: { assetId: string }[]
    }
    expect(result.totalFound).toBe(7)
    expect(result.assets.map((asset) => asset.assetId)).toEqual(['gen-1'])
  })

  it('不指定类型时两种都搜', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'anything' },
        },
      },
      { finished: true },
    )
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(mockGetPublicGenerationPage).toHaveBeenCalledWith(
      expect.objectContaining({ type: ['image', 'video'] }),
    )
  })

  it('空结果要说出来 —— 否则模型接着编一个 id 出来挂', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: '不存在的东西' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect((done?.result as { assets: unknown[] }).assets).toEqual([])
    expect(lastUserPrompt()).toContain('found NOTHING')
  })
})

describe('规划器的拒绝', () => {
  it('没有负面框时 set_negative 被拒（拍板 19 / 台账 BJ 同一条闸）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
          title: 'write negatives',
          args: { value: 'blurry' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, negativePrompt: undefined } }),
      ),
    )
    const step = stepsOf(events)[0]
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl,
    )
    // 拒绝理由要讲回给模型，让它改口而不是原样重试
    expect(lastUserPrompt()).toContain('REFUSED')
  })

  it('编出来的模型 id 被拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
          title: 'switch model',
          args: { modelId: 'Animagine XL' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownModel,
    )
  })

  it('没搜过就挂参考图 = unknownAsset（URL 永远不由模型写）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount',
          args: { assetId: 'made-up-id' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset,
    )
  })

  it('搜过之后挂得上，URL 来自服务端的检索结果', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-1',
          url: 'https://cdn.example.test/1.png',
          outputType: 'IMAGE',
          prompt: 'red umbrella',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'umbrella' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount it',
          args: { assetId: 'gen-1' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const mounted = stepsOf(events).find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(mounted?.payload).toMatchObject({
      assetId: 'gen-1',
      url: 'https://cdn.example.test/1.png',
      kind: 'image',
    })
    expect(mounted?.inverse).toEqual({ assetId: 'gen-1' })
  })

  it('set_specs 的值不在选项里就拒；合法时两个字段一起下（台账 AE/BG/BS）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'bad specs',
          args: { aspectRatio: '21:9', resolution: '2K' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'good specs',
          args: { aspectRatio: '16:9', resolution: '2K' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const steps = stepsOf(events)
    expect((steps[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue,
    )
    const applied = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(applied?.payload).toEqual({ aspectRatio: '16:9', resolution: '2K' })
    expect(applied?.inverse).toEqual({ aspectRatio: '1:1', resolution: 'auto' })
  })

  it('张数只认档位表里的值', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
          title: 'three please',
          args: { count: 3 },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue,
    )
  })
})

describe('prime_generate · 钱闸', () => {
  it('提示词是空的就拒 —— 与人手点生成键时的拦法一致', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.emptyPrompt,
    )
  })

  it('还没选模型也拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, prompt: 'something', model: null },
        }),
      ),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected,
    )
  })

  it('⛔ 备好了也只是让键亮起来：一次外部调用都没有，逆操作是灭掉它', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, prompt: 'a poster' } }),
      ),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toEqual({ primed: true })
    expect(done?.inverse).toEqual({ primed: false })
    expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
  })
})

describe('就地确认往返（拍板 3）', () => {
  const HAND_WRITTEN = { ...SNAPSHOT, prompt: '我自己写的一段提示词' }
  const OVERWRITE_TURN = {
    tool: {
      name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      title: 'rewrite the prompt',
      args: { value: '助手写的新提示词' },
    },
  }

  it('字段里有用户手写内容时先问，且这条流就此结束（不落任何写入）', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ snapshot: HAND_WRITTEN })),
    )

    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.confirmRequest,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    expect(events[0]).toMatchObject({
      field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
      have: '我自己写的一段提示词',
      proposed: '助手写的新提示词',
    })
    expect(events[1]).toMatchObject({
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
    // 第一步就停了 —— 只问了模型一次
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  it('带着「追加」重发就续跑，inverse 仍是改前原文', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.append,
            },
          ],
        }),
      ),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toEqual({
      value: '助手写的新提示词',
      mode: 'append',
    })
    expect(done?.inverse).toEqual({ value: '我自己写的一段提示词' })
  })

  it('带着「覆盖」重发就整段换掉', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.overwrite,
            },
          ],
        }),
      ),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toMatchObject({ mode: 'replace' })
  })

  it('选「保留」时那一步被拒，且线程里看得见为什么', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep,
            },
          ],
        }),
      ),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.userDeclined,
    )
  })

  it('助手覆盖自己刚写的草稿不再问第二次', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'draft',
          args: { value: '第一稿' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'revise',
          args: { value: '第二稿' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.some(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirmRequest,
      ),
    ).toBe(false)
    expect(stepsOf(events)).toHaveLength(4)
  })
})

describe('打断（拍板 13）', () => {
  it('开跑前就 abort：一次模型都不问，直接干净收尾', async () => {
    queueTurns({ finished: true })
    const controller = new AbortController()
    controller.abort()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest(), {
        signal: controller.signal,
      }),
    )
    expect(events).toEqual([
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
    ])
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })

  it('跑到一半 abort：不再开始下一步', async () => {
    const controller = new AbortController()
    mockLlmTextCompletion.mockImplementation(async () => {
      controller.abort()
      return JSON.stringify({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read',
          args: {},
        },
      })
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest(), {
        signal: controller.signal,
      }),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
    ])
  })

  it('消费方提前 break（客户端断开）时生成器照样收尾，不留在飞的一步', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read',
          args: {},
        },
      }),
    )

    const seenTypes: string[] = []
    for await (const event of runAssistantOperator('clerk-1', buildRequest())) {
      seenTypes.push(event.type)
      break
    }
    const seen = seenTypes.length

    // break 之后 for-await 会调 iterator.return()，生成器停在那一步，
    // 不会把剩下的 maxSteps 轮跑完。
    expect(seen).toBe(1)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })
})

describe('前情 steps（没有服务端会话态）', () => {
  it('上一轮做过什么由客户端带回来，并出现在提示里', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          priorSteps: [
            {
              tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
              status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
              summary: 'wrote the umbrella prompt',
            },
          ],
        }),
      ),
    )
    expect(lastUserPrompt()).toContain('wrote the umbrella prompt')
  })
})
