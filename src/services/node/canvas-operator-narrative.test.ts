/**
 * 「四镜叙事题」——**画布操作员的验收题**（C3 §5，题面来自 owner 2026-08-29 真机）。
 *
 * ── 为什么它值得一个自己的文件 ────────────────────────────────────────
 * `assistant-operator.service.test.ts` 里那 30 多条画布用例各验一条契约（这条工具
 * 拒不拒、那条 inverse 对不对）。这一份验的是**一整轮走完之后的形状**：模型按脚本
 * 走完七步，画布上该发生的五件事有没有全部发生，而且**顺序**对不对。
 * 单条契约全绿而这道题仍然做错，是 2026-08-29 那次真机的原形：助手照着自己的想象
 * 描写角色（没读卡）、挑了贵一档的渠道、只给第一镜挂参考、把台词写进 `prompt`。
 *
 * ── 为什么它住在 `services/node/` 而不是 `services/kernel/` ──────────────
 * 它同时驱动**两条链**：工具环（L0 kernel）与 marker 链（L3 node）。而分层契约
 * 只允许 L3 → L0，⛔ 不允许 kernel 里的任何文件（测试也算）import `@/services/node/*`
 * （`eslint.config.mjs` 的 `KERNEL_FORBIDDEN_PATTERNS`）。所以这道题的家在被测的
 * 那条更高的层上。
 *
 * ── 第 ⑥ 条：token 用量对比（验收 #12）────────────────────────────────
 * 同一张图、同一句话，工具环 vs marker 链（`node-assistant.service` 的提示词构造）。
 * ⚠ 两个数都要看，因为它们回答的是两个问题：
 *   · **首轮**比值 —— 「上下文根治做到了吗」。K-4 把 URL / 外观 / 节点正文赶出提示，
 *     首轮该更瘦；这一条有硬闸。
 *   · **整轮**比值 —— 「一次对话总共贵多少」。工具环每一步都是一次完整往返，
 *     marker 链只有一次，所以它必然是倍数级；这一条只记录不设闸（设了就是在拿
 *     「能不能做对」换「便不便宜」）。
 */

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

vi.mock('@/services/generation.service', () => ({
  getPublicGenerationPage: vi.fn(),
}))
vi.mock('@/services/kernel/assistant-asset-folder-vision.service', () => ({
  listAssistantAssetFolders: vi.fn(),
  inspectAssistantAssetFolder: vi.fn(),
}))
vi.mock('@/services/web-research.service', () => ({
  webImageSearch: vi.fn(),
  isWebImageSearchConfigured: () => false,
  gatherWebContext: vi.fn(),
  hasWebContext: () => false,
}))
vi.mock('@/services/vision/vision-route.service', () => ({
  findVisionCapableRoute: vi.fn(),
}))
vi.mock('@/services/lora/lora-candidates.service', () => ({
  searchLoraCandidates: vi.fn(),
}))
/** 连线规则真表今天全放开；这道题不连线，桩掉只为不碰真模块。 */
vi.mock('@/lib/node-connection-rules', () => ({
  canConnectNodeTypes: () => true,
}))
/** marker 链那一侧的模块级依赖 —— 这道题走 BYOK 分支，它们一次都不该被调到。 */
vi.mock('ai', () => ({ streamText: vi.fn() }))
vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
}))
vi.mock('@/lib/platform-keys', () => ({ getSystemApiKey: vi.fn() }))

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import { createNodeAssistantStream } from '@/services/node/node-assistant.service'
import {
  AssistantOperatorEventSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { NodeAssistantRequest } from '@/types/node-assistant'

// ─── 题面：一张四镜叙事的画布 ────────────────────────────────────────

const HERO_URL = 'https://cdn.example.test/lin-hero.png'
const HERO_REF_URL = 'https://cdn.example.test/lin-sheet.png'
const HERO_SEED = '短黑发，左耳一枚银环，深红色长风衣'
/** 台词 —— 落点必须是 `action`，⛔ 不是 `prompt`（shotText 没有 prompt 这一栏）。 */
const LINES = [
  '她推开门，雨声一下子灌进来。',
  '"又下雨了。" 她没有回头。',
  '便利店的灯在她脸上晃了一下。',
  '伞撑开的那一刻，雨停了。',
]

const SHOT_IDS = ['shot-1', 'shot-2', 'shot-3', 'shot-4']
const CLIP_IDS = ['clip-1', 'clip-2', 'clip-3', 'clip-4']

/** ⭐ 同一型号两条渠道：BytePlus 便宜、fal 贵。K-3 的题眼就在这两行。 */
const BYTEPLUS_OPTION_ID = 'byteplus:dreamina-seedance-2-0'
const FAL_OPTION_ID = 'fal:seedance-2.0'
const CLIP_MODEL_ID = 'seedance-2.0'

const CANVAS_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  availableModels: [],
  canvas: {
    projectId: 'proj-rain',
    projectName: '雨夜四镜',
    selectedNodeIds: [],
    nodes: [
      {
        id: 'char-lin',
        type: NODE_TYPE_IDS.image,
        title: '小林',
        status: 'done',
        role: 'character',
        fields: { prompt: 'a girl in a deep red coat' },
        references: [{ id: 'ref-sheet', role: 'identity', url: HERO_REF_URL }],
        character: { name: '小林', visualSeed: HERO_SEED },
        mediaUrl: HERO_URL,
      },
      ...SHOT_IDS.map((id, index) => ({
        id,
        type: NODE_TYPE_IDS.shotText,
        title: `镜头 ${index + 1}`,
        status: 'idle' as const,
        fields: { scene: '', action: '', camera: '', composition: '' },
        references: [],
      })),
      ...CLIP_IDS.map((id, index) => ({
        id,
        type: NODE_TYPE_IDS.seedance,
        title: `片段 ${index + 1}`,
        status: 'idle' as const,
        fields: { prompt: '', motion: '' },
        model: null,
        params: { duration: '5' },
        references: [],
      })),
    ],
    edges: SHOT_IDS.map((source, index) => ({
      id: `edge-${index + 1}`,
      source,
      target: CLIP_IDS[index],
    })),
    modelOptions: [
      {
        nodeType: NODE_TYPE_IDS.seedance,
        modelId: CLIP_MODEL_ID,
        optionId: BYTEPLUS_OPTION_ID,
        label: 'Seedance 2.0 · BytePlus',
        priceLabel: '1×',
      },
      {
        nodeType: NODE_TYPE_IDS.seedance,
        modelId: CLIP_MODEL_ID,
        optionId: FAL_OPTION_ID,
        label: 'Seedance 2.0 · fal',
        priceLabel: '1.6×',
      },
    ],
  },
}

const USER_ASK =
  '把小林的四镜雨夜搭起来：每一镜写台词，片段都挂上她的形象，用便宜那条渠道。'

function buildRequest(): AssistantOperatorRequest {
  return {
    messages: [{ role: 'user', content: USER_ASK }],
    domain: 'canvas',
    snapshot: CANVAS_SNAPSHOT,
  }
}

/**
 * marker 链的**同题请求**：同一张图、同一句话，按那条链自己的投影形状喂
 * （`lib/node-assistant-context.ts` 剥 URL 之后剩下的那些字段）。
 * ⚠ 不带 URL 是它自己的规矩，不是这里手下留情 —— 对比才公平。
 */
function buildMarkerRequest(): NodeAssistantRequest {
  const canvas = CANVAS_SNAPSHOT.canvas!
  return {
    locale: 'zh',
    apiKeyId: 'key-1',
    selectedNodeIds: [],
    messages: [{ role: 'user', content: USER_ASK }],
    nodes: canvas.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      status: node.status,
      title: node.title,
      ...(node.fields.prompt ? { promptExcerpt: node.fields.prompt } : {}),
      ...(node.model ? { model: node.model.modelId } : {}),
      ...(node.params ? { params: { duration: node.params.duration } } : {}),
      ...(node.references.length > 0
        ? {
            references: {
              limit: 6,
              items: node.references.map((reference) => ({
                role: reference.role,
              })),
            },
          }
        : {}),
    })) as NodeAssistantRequest['nodes'],
  }
}

// ─── 脚本化的模型（七步 + 收尾）───────────────────────────────────────

const TOOL = ASSISTANT_OPERATOR_TOOL_IDS

function turn(name: string, args: unknown, title = name) {
  return { tool: { name, title, args } }
}

/** 题面要求的那条正解，逐步写死。 */
function scriptedTurns(): unknown[] {
  return [
    {
      plan: ['读角色卡', '写四镜台词', '定渠道', '挂参考'],
      message: '先读小林那张卡，再按卡上的样子写四镜。',
      tool: {
        name: TOOL.readNode,
        title: 'read the character card',
        args: { nodeId: 'char-lin' },
      },
    },
    turn(TOOL.setNodeFields, {
      items: SHOT_IDS.map((nodeId, index) => ({
        nodeId,
        fields: { action: LINES[index] },
      })),
    }),
    turn(TOOL.setNodeModel, {
      nodeId: CLIP_IDS[0],
      modelId: CLIP_MODEL_ID,
      optionId: BYTEPLUS_OPTION_ID,
    }),
    ...CLIP_IDS.map((nodeId) =>
      turn(TOOL.attachRefs, {
        nodeId,
        refs: [{ sourceId: 'char-lin', role: 'identity' }],
      }),
    ),
    { finished: true },
  ]
}

function queueTurns(...turns: unknown[]): void {
  mockLlmTextCompletion.mockReset()
  for (const item of turns) {
    mockLlmTextCompletion.mockResolvedValueOnce(JSON.stringify(item))
  }
  mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ finished: true }))
}

async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) {
    expect(AssistantOperatorEventSchema.safeParse(event).success).toBe(true)
    out.push(event)
  }
  return out
}

function doneSteps(events: AssistantOperatorEvent[]) {
  return events
    .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.step)
    .map((event) => (event as { step: Record<string, unknown> }).step)
    .filter((step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
}

function promptCharsAt(index: number): number {
  const call = mockLlmTextCompletion.mock.calls[index]?.[0] as {
    systemPrompt: string
    userPrompt: string
  }
  return call.systemPrompt.length + call.userPrompt.length
}

function totalPromptChars(): number {
  return mockLlmTextCompletion.mock.calls.reduce(
    (sum, _call, index) => sum + promptCharsAt(index),
    0,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLlmTextCompletion.mockReset()
  mockEnsureUser.mockResolvedValue({ id: 'user-db-1' })
  mockResolveLlmTextRoute.mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
    apiKey: 'test-key',
  })
})

describe('验收题 · 四镜叙事（C3 §5）', () => {
  it('⭐ 七步走完：先读卡 → 台词落 action → BytePlus 渠道 → 四个片段全挂上参考', async () => {
    queueTurns(...scriptedTurns())
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const steps = doneSteps(events)

    // ① 第一步是读同名角色卡 —— ⛔ 不是凭想象开写。
    expect(steps[0].tool).toBe(TOOL.readNode)
    expect((steps[0].payload as { nodeId: string }).nodeId).toBe('char-lin')
    const digest = (steps[0].result as { digest: string }).digest
    expect(digest).toContain(HERO_SEED)
    expect(digest).toContain(HERO_REF_URL)

    // ② 台词落在 `action`，⛔ 不是 `prompt`（shotText 根本没有 prompt 这一栏）。
    const fieldsStep = steps[1]
    expect(fieldsStep.tool).toBe(TOOL.setNodeFields)
    const items = (
      fieldsStep.payload as {
        items: { nodeId: string; fields: Record<string, string> }[]
      }
    ).items
    expect(items.map((item) => item.nodeId)).toEqual(SHOT_IDS)
    for (const item of items) {
      expect(Object.keys(item.fields)).toEqual(['action'])
      expect(item.fields).not.toHaveProperty('prompt')
    }
    expect(items[1].fields.action).toBe(LINES[1])
    // 一批 = 一步（撤销粒度）：四镜只占一条日志。
    expect(
      steps.filter((step) => step.tool === TOOL.setNodeFields),
    ).toHaveLength(1)

    // ③ 换模型带的是 BytePlus 的渠道，⛔ 不是贵的那条 fal。
    const modelStep = steps[2]
    expect(modelStep.tool).toBe(TOOL.setNodeModel)
    expect(modelStep.payload).toMatchObject({
      nodeId: CLIP_IDS[0],
      modelId: CLIP_MODEL_ID,
      optionId: BYTEPLUS_OPTION_ID,
    })
    expect(JSON.stringify(modelStep.payload)).not.toContain(FAL_OPTION_ID)
    // 改前没选 → inverse 是 null（撤销 = 撤回到「还没选」）。
    expect(modelStep.inverse).toEqual({ nodeId: CLIP_IDS[0], model: null })

    // ④ 四个片段**全部**挂上角色卡的图，URL 由服务端从工作副本填。
    const attachSteps = steps.filter((step) => step.tool === TOOL.attachRefs)
    expect(attachSteps).toHaveLength(4)
    expect(
      attachSteps.map((step) => (step.payload as { nodeId: string }).nodeId),
    ).toEqual(CLIP_IDS)
    for (const step of attachSteps) {
      const refs = (
        step.payload as {
          refs: { url: string; sourceId?: string; source: string }[]
        }
      ).refs
      expect(refs).toHaveLength(1)
      expect(refs[0].url).toBe(HERO_URL)
      expect(refs[0].sourceId).toBe('char-lin')
    }

    // 一步都没被拒。
    expect(
      events.filter(
        (event) =>
          event.type === ASSISTANT_OPERATOR_EVENTS.step &&
          (event as { step: { status: string } }).step.status ===
            ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      ),
    ).toHaveLength(0)
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
  })

  it('⭐ 首轮提示零 URL、零外观、零节点正文（K-4 两向）', async () => {
    queueTurns(...scriptedTurns())
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const call = mockLlmTextCompletion.mock.calls[0][0] as {
      systemPrompt: string
      userPrompt: string
    }
    for (const prompt of [call.systemPrompt, call.userPrompt]) {
      expect(prompt).not.toContain('https://')
      expect(prompt).not.toContain(HERO_SEED)
      expect(prompt).not.toContain('a girl in a deep red coat')
    }
    // 概览级的东西照常在：节点 id / 类型 / 标题 / 边 / 目录。
    expect(call.userPrompt).toContain('char-lin · image/character · "小林"')
    expect(call.userPrompt).toContain(`optionId=${BYTEPLUS_OPTION_ID}`)
  })

  it('把台词写进 shotText 的 prompt 会被 unknownField 拒（落点表说了算）', async () => {
    queueTurns(
      turn(TOOL.setNodeFields, {
        items: [{ nodeId: 'shot-1', fields: { prompt: LINES[0] } }],
      }),
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const errored = events
      .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.step)
      .map((event) => (event as { step: Record<string, unknown> }).step)
      .find((step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((errored?.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownField,
    )
  })
})

/**
 * 首轮提示的比值上限（验收 #12）。
 *
 * ⚠ 它是**回归闸不是设计目标**：今天量到多少就钉在稍宽一点的地方，往上漂了要有人
 * 解释为什么。⛔ 别把它调大来「让测试过」—— 那正是这条闸存在的理由。
 */
const FIRST_TURN_PROMPT_RATIO_CEILING = 2

describe('token 用量对比 · 工具环 vs marker 链（验收 #12）', () => {
  it('同题同图：首轮提示不到 marker 链的两倍；整轮倍数记录在案', async () => {
    // ① 工具环：跑完这道题的七步 + 收尾。
    queueTurns(...scriptedTurns())
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const operatorFirstTurn = promptCharsAt(0)
    const operatorTotal = totalPromptChars()
    const operatorTurns = mockLlmTextCompletion.mock.calls.length

    // ② marker 链：同一张图、同一句话，一次往返。
    mockLlmTextCompletion.mockReset()
    mockLlmTextCompletion.mockResolvedValue('好的，我来安排。')
    await createNodeAssistantStream('clerk-1', buildMarkerRequest())
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    const markerTotal = totalPromptChars()

    const firstTurnRatio = operatorFirstTurn / markerTotal
    const totalRatio = operatorTotal / markerTotal
    // ⚠ 这个数要出现在完成报告里（验收 #12），所以它打出来而不是只做断言。
    console.log(
      `[C3 token] operator first turn ${operatorFirstTurn} chars · operator total ${operatorTotal} chars over ${operatorTurns} turns · marker ${markerTotal} chars · first-turn ${firstTurnRatio.toFixed(2)}× · total ${totalRatio.toFixed(2)}×`,
    )

    expect(firstTurnRatio).toBeLessThan(FIRST_TURN_PROMPT_RATIO_CEILING)
    // 整轮必然是倍数级（每一步一次完整往返）；只断言它没有失控到离谱。
    expect(totalRatio).toBeGreaterThan(1)
    expect(operatorTurns).toBe(8)
  })
})
