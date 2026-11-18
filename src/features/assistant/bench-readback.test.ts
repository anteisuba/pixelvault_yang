import { describe, expect, it } from 'vitest'

import type {
  AssistantOperatorPriorStep,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

import { readBackBench, type BenchReadbackRequest } from './bench-readback'

function snapshot(
  change: { aspectRatio?: string; count?: number } = {},
): AssistantOperatorSnapshot {
  return {
    prompt: 'a cat',
    negativePrompt: '',
    model: { id: 'model-a', label: 'Model A' },
    availableModels: [{ id: 'model-a', label: 'Model A' }],
    specs: {
      aspectRatio: change.aspectRatio ?? '1:1',
      resolution: null,
      qualityOptions: [],
      backgroundOptions: [],
      aspectRatioOptions: ['1:1', '16:9', '9:16'],
      resolutionOptions: ['2K', '4K'],
    },
    count: { value: change.count ?? 1, options: [1, 2, 4] },
  } as AssistantOperatorSnapshot
}

const specs = (aspectRatio: string): BenchReadbackRequest =>
  ({
    tool: 'set_specs',
    title: 'specs',
    payload: {
      aspectRatio,
      resolution: 'auto',
      quality: undefined,
      preview: undefined,
      background: undefined,
      complexity: undefined,
    },
  }) as BenchReadbackRequest

const count = (value: number): BenchReadbackRequest =>
  ({
    tool: 'set_count',
    title: 'count',
    payload: { count: value },
  }) as BenchReadbackRequest

describe('改完读回：实际值只认落下之后的快照（11-18）', () => {
  it('成功：比例按请求落下，写「as requested」，没有对不上的', () => {
    const read = readBackBench({
      requested: [specs('16:9')],
      snapshot: snapshot({ aspectRatio: '16:9' }),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(0)
    expect(read.text).toContain('everything landed as requested')
    expect(read.text).toContain('- aspect ratio: 16:9 (as requested)')
    // 清晰度请求「不设」、表单是不设态：算对上。
    expect(read.text).toContain('- resolution: (not set) (as requested)')
  })

  it('被收窄：要 8 张、表单只留得住 4 张 —— 写「请求 8，实际 4」与候选', () => {
    const read = readBackBench({
      requested: [count(8)],
      snapshot: snapshot({ count: 4 }),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toContain('did NOT land as requested')
    expect(read.text).toMatch(
      /pictures per run: NOT CHANGED AS ASKED — requested 8, actually 4; reason: "8" is not an option .*options: 1, 2, 4/,
    )
  })

  it('落下后又被改回去：值在候选里但台上还是旧值 —— 如实说没留住', () => {
    const read = readBackBench({
      requested: [specs('16:9')],
      snapshot: snapshot({ aspectRatio: '1:1' }),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toMatch(
      /aspect ratio: NOT CHANGED AS ASKED — requested 16:9, actually 1:1; reason: it was written, but the bench does not show it now/,
    )
  })

  it('被拒：浏览器落的时候表单没收 —— 原因取那一步的 detail', () => {
    const refused: AssistantOperatorPriorStep = {
      tool: 'set_specs',
      status: 'error',
      summary: 'specs',
      rejectReason: 'unknownValue',
      detail: 'the bench form refused this value',
      thisTurn: true,
    }
    const read = readBackBench({
      requested: [specs('16:9')],
      snapshot: snapshot({ aspectRatio: '1:1' }),
      priorSteps: [refused],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toContain(
      'requested 16:9, actually 1:1; reason: the bench form refused this value',
    )
  })

  it('之前几轮的被拒不算这一次的原因', () => {
    const read = readBackBench({
      requested: [specs('16:9')],
      snapshot: snapshot({ aspectRatio: '1:1' }),
      priorSteps: [
        {
          tool: 'set_specs',
          status: 'error',
          summary: 'specs',
          detail: 'old refusal',
        },
      ],
    })
    expect(read.text).not.toContain('old refusal')
  })
})
