import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_READ_TOOLS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_HINTS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  isMutatingAssistantOperatorTool,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'
import {
  ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS,
  AssistantOperatorEventSchema,
  AssistantOperatorRequestSchema,
  AssistantOperatorSnapshotSchema,
  AssistantOperatorStepSchema,
  AssistantOperatorTurnSchema,
} from '@/types/assistant-operator'
import { OUTPUT_TYPE_VALUES } from '@/types'

/**
 * 每个工具一份**合法**的 step 载荷。
 *
 * ⚠ 写成 `Record<AssistantOperatorTool, …>` 是有意的：加一条工具而没在这里给
 * 载荷，编译期就红 —— 于是「新工具没人验它的 inverse」这件事不可能悄悄发生。
 */
const STEP_FIXTURES: Record<
  AssistantOperatorTool,
  { payload: unknown; inverse?: unknown; result?: unknown }
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: {
    payload: {},
    result: { digest: '- Prompt in the editor: (empty)' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]: {
    payload: { query: 'red umbrella', kind: 'image', limit: 6 },
    result: {
      totalFound: 12,
      assets: [
        {
          assetId: 'gen-1',
          url: 'https://cdn.example.com/a.png',
          kind: 'image',
        },
      ],
    },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: {
    payload: {
      assetId: 'gen-1',
      url: 'https://cdn.example.com/a.png',
      kind: 'image',
    },
    inverse: { assetId: 'gen-1' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: {
    payload: { modelId: 'seedream-4', modelLabel: 'Seedream 4' },
    inverse: { modelId: null },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: {
    payload: { value: 'a girl under a red umbrella', mode: 'replace' },
    inverse: { value: '' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: {
    payload: { value: 'blurry, lowres', mode: 'replace' },
    inverse: { value: '' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: {
    payload: { aspectRatio: '16:9', resolution: '2K' },
    inverse: { aspectRatio: '1:1', resolution: 'auto' },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: {
    payload: { count: 2 },
    inverse: { count: 1 },
  },
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: {
    payload: { primed: true },
    inverse: { primed: false },
  },
}

function buildStep(tool: AssistantOperatorTool, omitInverse = false) {
  const fixture = STEP_FIXTURES[tool]
  return {
    id: `step-${tool}`,
    title: 'a title',
    tool,
    status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    payload: fixture.payload,
    ...(fixture.result === undefined ? {} : { result: fixture.result }),
    ...(fixture.inverse === undefined || omitInverse
      ? {}
      : { inverse: fixture.inverse }),
  }
}

const SNAPSHOT = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [{ id: 'seedream-4', label: 'Seedream 4' }],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

describe('操作员工具表', () => {
  it('读 / 改动型两张表恰好覆盖全部工具且互不重叠', () => {
    const read = new Set<string>(ASSISTANT_OPERATOR_READ_TOOLS)
    const mutating = new Set<string>(ASSISTANT_OPERATOR_MUTATING_TOOLS)

    expect([...read].filter((tool) => mutating.has(tool))).toEqual([])
    expect([...read, ...mutating].sort()).toEqual(
      [...ASSISTANT_OPERATOR_TOOLS].sort(),
    )
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(isMutatingAssistantOperatorTool(tool)).toBe(mutating.has(tool))
    }
  })

  it('每个工具都有给模型看的说明和一份入参 schema', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(ASSISTANT_OPERATOR_TOOL_HINTS[tool].length).toBeGreaterThan(20)
      expect(ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[tool]).toBeDefined()
    }
  })

  it('⛔ 钱闸：工具表里没有任何一条能创建 generation', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      expect(tool).not.toMatch(/^generate/)
    }
    // prime 是唯一沾生成的一条，而它的载荷只有一个 primed 布尔 —— 没有任何
    // 「跑一次」的语义可以藏在里面。
    const primed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
      ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate
    ].safeParse({ modelId: 'x', run: true })
    expect(primed.success).toBe(true)
    expect(primed.data).toEqual({})
  })

  it('检索类型是 OUTPUT_TYPE_VALUES 的子集', () => {
    for (const kind of ASSISTANT_OPERATOR_SEARCH_KINDS) {
      expect(OUTPUT_TYPE_VALUES).toContain(kind)
    }
  })

  it('open 事件名与传输层握手帧共用一个值', () => {
    expect(ASSISTANT_OPERATOR_EVENTS.open).toBe(ASSISTANT_STREAM_EVENTS.open)
  })
})

describe('step 契约 · inverse 完备性', () => {
  it('每个工具的合法 step 都能通过校验', () => {
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      const parsed = AssistantOperatorStepSchema.safeParse(buildStep(tool))
      expect(
        parsed.success,
        `${tool} 的合法 step 应该通过：${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true)
    }
  })

  it('⭐ 改动型 step 缺 inverse 必须校验失败', () => {
    for (const tool of ASSISTANT_OPERATOR_MUTATING_TOOLS) {
      const parsed = AssistantOperatorStepSchema.safeParse(
        buildStep(tool, true),
      )
      expect(parsed.success, `${tool} 少了 inverse 却通过了校验`).toBe(false)
    }
  })

  it('读类 step 没有 inverse 也照样通过（它没有东西可撤）', () => {
    for (const tool of ASSISTANT_OPERATOR_READ_TOOLS) {
      expect(
        AssistantOperatorStepSchema.safeParse(buildStep(tool)).success,
      ).toBe(true)
    }
  })

  it('读类 step 在 running 阶段 result 为 null，done 阶段必须有值', () => {
    const running = AssistantOperatorStepSchema.safeParse({
      ...buildStep(ASSISTANT_OPERATOR_TOOL_IDS.searchAssets),
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      result: null,
    })
    expect(running.success).toBe(true)

    const missingResult = AssistantOperatorStepSchema.safeParse({
      id: 'step-1',
      title: 'searching',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: { query: 'x', kind: null, limit: 6 },
    })
    expect(missingResult.success).toBe(false)
  })

  it('set_specs 必须同时带比例与清晰度（台账 AE/BG/BS）', () => {
    const onlyRatio = AssistantOperatorStepSchema.safeParse({
      ...buildStep(ASSISTANT_OPERATOR_TOOL_IDS.setSpecs),
      payload: { aspectRatio: '16:9' },
    })
    expect(onlyRatio.success).toBe(false)
  })

  it('被拒的一步照样是合法 step，且不需要 inverse', () => {
    const rejected = AssistantOperatorStepSchema.safeParse({
      id: 'step-9',
      title: 'switch model',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownModel,
        detail: 'Animagine XL',
      },
    })
    expect(rejected.success).toBe(true)
  })

  it('不认识的拒绝理由不给过 —— 词表是封闭的', () => {
    const parsed = AssistantOperatorStepSchema.safeParse({
      id: 'step-9',
      title: 'switch model',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: 'because-i-said-so' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('事件契约', () => {
  it('八种事件都能解析', () => {
    const events: unknown[] = [
      { type: ASSISTANT_OPERATOR_EVENTS.open },
      { type: ASSISTANT_OPERATOR_EVENTS.plan, steps: ['查素材', '填表单'] },
      {
        type: ASSISTANT_OPERATOR_EVENTS.step,
        step: buildStep(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt),
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.confirmRequest,
        field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
        have: '我自己写的一段',
        proposed: '助手想写的一段',
      },
      { type: ASSISTANT_OPERATOR_EVENTS.message, text: '好的' },
      { type: ASSISTANT_OPERATOR_EVENTS.done },
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
      {
        type: ASSISTANT_OPERATOR_EVENTS.error,
        error: 'boom',
        errorCode: 'ASSISTANT_OPERATOR_FAILED',
      },
    ]

    for (const event of events) {
      const parsed = AssistantOperatorEventSchema.safeParse(event)
      expect(
        parsed.success,
        `${JSON.stringify(event)} → ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true)
    }
  })

  it('confirm_request 只认那两个字段', () => {
    expect(
      AssistantOperatorEventSchema.safeParse({
        type: ASSISTANT_OPERATOR_EVENTS.confirmRequest,
        field: 'aspectRatio',
        have: 'x',
        proposed: 'y',
      }).success,
    ).toBe(false)
  })
})

describe('请求与快照契约', () => {
  it('最小请求可解析', () => {
    const parsed = AssistantOperatorRequestSchema.safeParse({
      messages: [{ role: 'user', content: '帮我配一张海报' }],
      domain: 'image',
      snapshot: SNAPSHOT,
    })
    expect(parsed.success).toBe(true)
  })

  it('负面框「缺席」与「空着」是两件事', () => {
    const absent = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      negativePrompt: undefined,
    })
    expect(absent.negativePrompt).toBeUndefined()

    const empty = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      negativePrompt: '',
    })
    expect(empty.negativePrompt).toBe('')
  })

  it('模型 null（没选）与缺席（这个台不选模型）也是两件事', () => {
    const notSelected = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      model: null,
    })
    expect(notSelected.model).toBeNull()

    const noControl = AssistantOperatorSnapshotSchema.parse({
      ...SNAPSHOT,
      model: undefined,
    })
    expect(noControl.model).toBeUndefined()
  })

  it('前情 steps 有条数上限（没有服务端会话态，全靠客户端带回来）', () => {
    const tooMany = Array.from(
      { length: ASSISTANT_OPERATOR_LIMITS.maxPriorSteps + 1 },
      () => ({
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
        summary: 'wrote the prompt',
      }),
    )
    expect(
      AssistantOperatorRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'x' }],
        domain: 'image',
        snapshot: SNAPSHOT,
        priorSteps: tooMany,
      }).success,
    ).toBe(false)
  })

  it('确认回执认三个选择', () => {
    for (const choice of Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES)) {
      expect(
        AssistantOperatorRequestSchema.safeParse({
          messages: [{ role: 'user', content: 'x' }],
          domain: 'image',
          snapshot: SNAPSHOT,
          confirmations: [
            { field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt, choice },
          ],
        }).success,
      ).toBe(true)
    }
  })

  it('canvas 不在 P1 的域里', () => {
    expect(
      AssistantOperatorRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'x' }],
        domain: 'canvas',
        snapshot: SNAPSHOT,
      }).success,
    ).toBe(false)
  })
})

describe('模型这一轮写的东西（宽松层）', () => {
  it('工具调用可解析，未知字段被剥掉', () => {
    const parsed = AssistantOperatorTurnSchema.safeParse({
      plan: ['先看看表单'],
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
        title: 'read the form',
        args: {},
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('不认识的工具名当场拒 —— 值域校验只对**已知**工具留给规划器', () => {
    expect(
      AssistantOperatorTurnSchema.safeParse({
        tool: { name: 'generate_image', title: 'go', args: {} },
      }).success,
    ).toBe(false)
  })

  it('漏写标题 / args 给 null 都不作废整轮（每步都是一次 LLM 往返，别为装饰字段烧步）', () => {
    const parsed = AssistantOperatorTurnSchema.safeParse({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
        args: null,
      },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.tool?.args).toEqual({})
    expect(parsed.data?.tool?.title).toBeUndefined()
  })

  it('模型写的档位值故意宽松收下（值域校验在规划器）', () => {
    const parsed = ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[
      ASSISTANT_OPERATOR_TOOL_IDS.setSpecs
    ].safeParse({ aspectRatio: '21:9', resolution: '8K' })
    expect(parsed.success).toBe(true)
  })
})
