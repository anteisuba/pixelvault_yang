import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_LIMITS } from '@/constants/assistant-v3'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { fetchAsBuffer, recordLedgerStep } = vi.hoisted(() => ({
  fetchAsBuffer: vi.fn(),
  recordLedgerStep: vi.fn(),
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  recordLedgerStep,
  rememberStepArtifacts: vi.fn(),
  isFatalOperatorToolError: () => false,
  planTool: vi.fn(),
  TOOL_FAILED_DETAIL: 'tool failed',
  toStepEvent: (raw: unknown) => ({
    type: 'step',
    step: AssistantOperatorStepSchema.parse(raw),
  }),
}))

/** 测试里的「图」：内容写着格式与地址（`png:https://…`），格式不在名单里就认不出。 */
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer,
  detectTrustedImageMime: async (
    buffer: Buffer,
    formats: ReadonlySet<string>,
  ) => {
    const format = buffer.toString().split(':')[0] ?? ''
    if (!formats.has(format)) throw new Error('unsupported image')
    return { format, mimeType: `image/${format}`, width: 512, height: 768 }
  },
}))

import type { V3Context } from './assistant-v3-steps.service'
import {
  createPictureCache,
  executeV3Look,
  loadFreshLooks,
  picturesRideInToolResult,
} from './assistant-v3-look.service'

/** 地址 → 格式；没登记的地址下不来。 */
const served = new Map<string, string>()

function context(overrides: Partial<V3Context> = {}): V3Context {
  return {
    face: 'canvas',
    clerkId: 'clerk-1',
    prepared: {
      run: { stepSeq: 0, signal: undefined },
      user: { id: 'user-1' },
    },
    request: { messages: [] },
    nodes: [],
    handles: {},
    language: 'english',
    stepPrefix: 'v3s1',
    transcript: [{ type: 'board', text: 'BOARD', images: [] }],
    replyText: { current: '' },
    seesImages: true,
    pictures: createPictureCache(AI_ADAPTER_TYPES.OPENAI),
    ...overrides,
  } as unknown as V3Context
}

function picture(name: string, format = 'png') {
  const url = `https://cdn.test/${name}.${format}`
  served.set(url, format)
  return { url, label: name }
}

async function run(
  generator: AsyncGenerator<AssistantOperatorEvent, unknown>,
): Promise<{ events: AssistantOperatorEvent[]; outcome: unknown }> {
  const events: AssistantOperatorEvent[] = []
  for (;;) {
    const next = await generator.next()
    if (next.done) return { events, outcome: next.value }
    events.push(next.value)
  }
}

describe('v3 look · Denia 自己看', () => {
  beforeEach(() => {
    served.clear()
    recordLedgerStep.mockReset()
    fetchAsBuffer.mockReset()
    fetchAsBuffer.mockImplementation(async (url: string) => {
      const format = served.get(url)
      if (!format) throw new Error('unreachable')
      return { buffer: Buffer.from(`${format}:${url}`), mimeType: 'image/*' }
    })
  })

  it('一次最多看 maxLookCards 张：多出来的明说只看了前几张', async () => {
    const targets = Array.from(
      { length: ASSISTANT_V3_LIMITS.maxLookCards + 2 },
      (_, index) => picture(`p${index + 1}`),
    )
    const { events, outcome } = await run(
      executeV3Look(context(), { targets, notes: [], question: 'who is who?' }),
    )
    expect(fetchAsBuffer).toHaveBeenCalledTimes(
      ASSISTANT_V3_LIMITS.maxLookCards,
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      images: targets.slice(0, ASSISTANT_V3_LIMITS.maxLookCards),
    })
    const output = (outcome as { output: string }).output
    expect(output).toContain(
      `Only the first ${ASSISTANT_V3_LIMITS.maxLookCards} pictures were looked at; 「p7」, 「p8」 were not.`,
    )
    expect(output).toContain(
      'You are looking at these pictures for: "who is who?"',
    )
    expect(output).toContain('for your next step only')
    expect(output).toContain('1 = 「p1」 (512×768)')
    // 过程行只写看了哪几张，⛔ 不写看到了什么。
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'step',
      step: {
        tool: 'read_state',
        status: 'done',
        result: { digest: 'p1 · p2 · p3 · p4 · p5 · p6' },
      },
    })
  })

  it('一张下不来只点名那一张，其余照看，⛔ 不连坐整步', async () => {
    const good = picture('harry')
    const gif = picture('goyle', 'gif')
    const lost = { url: 'https://cdn.test/gone.png', label: 'gone' }
    const { events, outcome } = await run(
      executeV3Look(context(), {
        targets: [good, gif, lost],
        notes: [],
        question: 'compare',
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: false,
      images: [good],
    })
    expect((outcome as { output: string }).output).toContain(
      'Could not load 「goyle」, 「gone」',
    )
    expect(events[0]).toMatchObject({ step: { status: 'done' } })
  })

  it('一张都没下来：这一步才算失败', async () => {
    const { events, outcome } = await run(
      executeV3Look(context(), {
        targets: [{ url: 'https://cdn.test/gone.png', label: 'gone' }],
        notes: [],
        question: '',
      }),
    )
    expect(outcome).toMatchObject({
      kind: 'result',
      error: true,
      failureKey: 'look:unloaded',
    })
    expect(outcome).not.toHaveProperty('images')
    expect(events[0]).toMatchObject({ step: { status: 'error' } })
  })

  it('所选模型看不了图：只回一句换模型，⛔ 不下图、不借别家', async () => {
    const { events, outcome } = await run(
      executeV3Look(context({ seesImages: false }), {
        targets: [picture('harry')],
        notes: [],
        question: 'who?',
      }),
    )
    expect(events).toEqual([])
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      kind: 'result',
      error: true,
      failureKey: 'look:noVision',
    })
    expect((outcome as { output: string }).output).toContain(
      'cannot see pictures, and no other provider is used in its place',
    )
  })

  it('已经附在这一轮那句话里的图⛔ 不再附一遍，只指给模型看', async () => {
    const pointed = picture('door')
    const { outcome } = await run(
      executeV3Look(
        context({
          transcript: [{ type: 'board', text: 'BOARD', images: [pointed] }],
        }),
        { targets: [pointed], notes: [], question: 'what is it?' },
      ),
    )
    expect(outcome).toMatchObject({ kind: 'result', error: false })
    expect(outcome).not.toHaveProperty('images')
    expect((outcome as { output: string }).output).toContain(
      "Already in front of you in the creator's message: 「door」 (picture 1 of IMAGES THE CREATOR POINTED AT)",
    )
  })

  it('图只附给紧跟着的那一次调用：模型一开口（新的 assistant 条目）就不再附', async () => {
    const harry = picture('harry')
    const look: AssistantV3Transcript = [
      { type: 'board', text: 'BOARD', images: [] },
      {
        type: 'assistant',
        text: '',
        calls: [{ id: 'call_1', tool: 'look', input: '{}' }],
      },
      {
        type: 'result',
        id: 'call_1',
        tool: 'look',
        output: 'looked',
        error: false,
        images: [harry],
      },
    ]
    const fresh = await loadFreshLooks(
      look,
      createPictureCache(AI_ADAPTER_TYPES.OPENAI),
    )
    expect([...fresh.keys()]).toEqual(['call_1'])
    expect(fresh.get('call_1')).toMatchObject({
      header: 'PICTURES FROM YOUR look (in order): 1 = 「harry」',
    })
    expect(fresh.get('call_1')?.pictures).toHaveLength(1)

    const later = await loadFreshLooks(
      [...look, { type: 'assistant', text: '是哈利。', calls: [] }],
      createPictureCache(AI_ADAPTER_TYPES.OPENAI),
    )
    expect(later.size).toBe(0)
  })

  it('单图上限按所选那家收紧：Claude 是 base64 后 10 MB，别家 20 MB', () => {
    expect(createPictureCache(AI_ADAPTER_TYPES.ANTHROPIC).maxBytes).toBe(
      7_500_000,
    )
    for (const adapter of [
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.GEMINI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.XAI,
    ])
      expect(createPictureCache(adapter).maxBytes).toBe(20_000_000)
  })

  it('Gemini 把图放进工具结果，另外四家跟在工具结果后的 user 里', () => {
    expect(picturesRideInToolResult(AI_ADAPTER_TYPES.GEMINI)).toBe(true)
    for (const adapter of [
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.XAI,
    ])
      expect(picturesRideInToolResult(adapter)).toBe(false)
  })
})
