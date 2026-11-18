import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { V3Context } from '@/features/assistant/services/assistant-v3-steps.service'
import { toWorkingState } from '@/features/assistant/services/assistant-operator-run.service'
import type {
  AssistantOperatorEvent,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

import { renderBench, runEdit } from './bench'

/**
 * 11-17 真机（生产 `/zh/studio/image`，Seedream 5.0 Lite · 火山）：
 * 「把提示词换成…比例改成 16:9。先别出图，告诉我这样出一张要多少钱。」
 * 提示词换了，比例没换；助手却说「按 16:9」，还弹了确认卡报价。
 * 根因：台上清晰度没设（`null` = 交给模型默认）而这个模型有清晰度档（2K / 4K），
 * 只改比例的那一条被「比例与清晰度都要给」拒了，拒条又是静默草稿。
 */
const SEEDREAM_LITE = 'seedream-5.0-lite-volcengine'

function imageBenchSnapshot(): AssistantOperatorSnapshot {
  return {
    prompt: 'a cat',
    negativePrompt: '',
    model: { id: SEEDREAM_LITE, label: 'Seedream 5.0 Lite（火山引擎）' },
    availableModels: [
      { id: SEEDREAM_LITE, label: 'Seedream 5.0 Lite（火山引擎）' },
    ],
    specs: {
      aspectRatio: '1:1',
      resolution: null,
      qualityOptions: [],
      backgroundOptions: [],
      aspectRatioOptions: ['1:1', '16:9', '9:16'],
      resolutionOptions: ['2K', '4K'],
    },
    count: { value: 1, options: [1, 2, 4] },
  } as AssistantOperatorSnapshot
}

function imageBenchContext(
  snapshot = imageBenchSnapshot(),
  latest = '比例改成 16:9',
): V3Context {
  const request = {
    domain: 'image',
    workspaceKey: 'image',
    snapshot,
    messages: [{ role: 'user', content: latest }],
  }
  return {
    face: 'image',
    clerkId: 'clerk_test',
    stepPrefix: 'step',
    language: 'chinese',
    request,
    nodes: [],
    transcript: [],
    replyText: { current: '' },
    prepared: {
      user: { id: 'user_test' },
      run: {
        userId: 'user_test',
        request,
        state: toWorkingState(snapshot),
        nextKernel: true,
        stepSeq: 0,
        ledgerSteps: 0,
        roundLedger: { facts: [], todos: [], conclusions: [] },
        searchIndex: new Map(),
        executedSteps: new Map(),
        stepKeys: new Set(),
        assistantWrittenFields: new Set(),
        researchSnippets: new Map(),
        workingMemoryIndex: new Map(),
      },
      persona: {},
    },
  } as unknown as V3Context
}

async function drain<T>(
  run: AsyncGenerator<AssistantOperatorEvent, T>,
): Promise<{ result: T; events: AssistantOperatorEvent[] }> {
  const events: AssistantOperatorEvent[] = []
  for (;;) {
    const next = await run.next()
    if (next.done) return { result: next.value, events }
    events.push(next.value)
  }
}

describe('图片台 edit：回给模型的是台上落下后的真值（11-17）', () => {
  it('只改比例：清晰度没设（模型默认）也照样改成，不再被「两格都要给」拒掉', async () => {
    const context = imageBenchContext()
    const { result, events } = await drain(
      runEdit(context, [{ op: 'specs', aspectRatio: '16:9' }]),
    )
    expect(result.error).toBe(false)
    expect(result.output).not.toContain('not done')
    // 浏览器那一侧收到的就是 16:9，清晰度仍是「没设」那一档（auto = 表单里的不设态）。
    const done = events.find(
      (event) =>
        event.type === 'step' &&
        'step' in event &&
        event.step.tool === 'set_specs' &&
        event.step.status === 'done',
    )
    expect(done).toBeDefined()
    expect(context.prepared.run.state.aspectRatio).toBe('16:9')
    // 回执里写的是落下之后的样子。
    expect(result.output).toContain('aspect ratio 16:9')
  })

  it('一条没落成：回执点名没改成、为什么、台上现在是多少', async () => {
    const context = imageBenchContext()
    const { result } = await drain(
      runEdit(context, [
        {
          op: 'prompt',
          mode: 'replace',
          text: '一只橘猫趴在窗台上，午后阳光。',
        },
        { op: 'specs', aspectRatio: '21:9' },
      ]),
    )
    expect(result.output).toMatch(/NOT everything landed: 1 of 2/)
    expect(result.output).not.toMatch(/1\. prompt — not done/)
    expect(result.output).toMatch(
      /2\. specs — not done: .*"21:9" is not an option.*stays 1:1/,
    )
    expect(result.output).toContain('aspect ratio 1:1')
    expect(context.prepared.run.state.prompt).toBe(
      '一只橘猫趴在窗台上，午后阳光。',
    )
  })

  it('改完的回执带上这一批的估价（与出图键旁那个数同一个算式）', async () => {
    const context = imageBenchContext()
    const { result } = await drain(
      runEdit(context, [{ op: 'count', count: 2 }]),
    )
    expect(result.output).toContain('2 per run')
    expect(result.output).toMatch(/about \$0\.0[0-9]+ per run/)
  })

  it('板子上直接印价钱，并说清问价不必调 generate', () => {
    const board = renderBench(imageBenchContext(), [], '这样出一张多少钱')
    expect(board).toMatch(/Price: about \$0\.0[0-9]+ per run/)
    expect(board).toContain('never call generate just to show a price')
  })
})
