import { describe, expect, it } from 'vitest'

import type {
  AssistantOperatorPriorStep,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'

import {
  readBackBench,
  USER_URL_THUMBNAIL_FALLBACK_DETAIL,
  type BenchReadbackRequest,
} from './bench-readback'

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

describe('网图挂参考读回（11-19 真机：Leonardo 那张没取回来，她说「挂好了」）', () => {
  const importUrl = (handle: string): BenchReadbackRequest =>
    ({
      tool: 'import_user_url',
      title: `导入链接 ${handle}`,
      payload: {
        url: `https://cdn.leonardo.test/${handle.slice(1)}.jpg`,
        domain: 'app.leonardo.ai',
      },
    }) as BenchReadbackRequest
  const withReferences = (count: number): AssistantOperatorSnapshot => ({
    ...snapshot(),
    references: {
      items: Array.from({ length: count }, (_, index) => ({
        id: `ref-${index + 1}`,
        url: `https://r2.test/${index + 1}.png`,
      })),
      limit: 4,
    } as AssistantOperatorSnapshot['references'],
  })
  const fetchFailed = (title: string): AssistantOperatorPriorStep => ({
    tool: 'import_user_url',
    status: 'error',
    summary: title,
    rejectReason: 'referenceImageUnavailable',
    detail:
      'The browser could not fetch that picture from app.leonardo.ai (WEB_IMAGE_IMPORT_FORBIDDEN), so nothing was mounted',
    thisTurn: true,
  })

  it('浏览器取图失败：写「没挂上 + 原因」，⛔ 不说挂好了', () => {
    const read = readBackBench({
      requested: [importUrl('#3')],
      snapshot: withReferences(0),
      priorSteps: [fetchFailed('导入链接 #3')],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toContain('did NOT land as requested')
    expect(read.text).toMatch(
      /reference picture: NOT CHANGED AS ASKED — requested mount the picture from app\.leonardo\.ai, actually NOT mounted \(0\/4 reference pictures on the bench now\); reason: The browser could not fetch that picture from app\.leonardo\.ai \(WEB_IMAGE_IMPORT_FORBIDDEN\)/,
    )
    expect(read.text).not.toContain('everything landed')
  })

  it('取回来了：写 mounted 与参考位现在几张', () => {
    const read = readBackBench({
      requested: [importUrl('#3')],
      snapshot: withReferences(1),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(0)
    expect(read.text).toContain(
      '- reference picture: mounted (1/4 reference pictures on the bench now) (as requested)',
    )
  })

  it('挂上的是缩略图（11-19）：写 mounted 但如实说清晰度低，⛔ 不算没落', () => {
    const read = readBackBench({
      requested: [importUrl('#2'), importUrl('#3')],
      snapshot: withReferences(2),
      priorSteps: [
        {
          tool: 'import_user_url',
          status: 'done',
          summary: '导入链接 #3',
          detail: USER_URL_THUMBNAIL_FALLBACK_DETAIL,
          thisTurn: true,
        },
      ],
    })
    expect(read.mismatched).toBe(0)
    const [first, second] = read.text.split('\n').slice(1)
    expect(first).toBe(
      '- reference picture: mounted (2/4 reference pictures on the bench now) (as requested)',
    )
    expect(second).toContain(
      `- reference picture: mounted, but ${USER_URL_THUMBNAIL_FALLBACK_DETAIL} (2/4`,
    )
    expect(second).toContain('LOW RESOLUTION')
  })

  it('缩略图那句说明放得进 priorSteps 的 detail 上限', () => {
    expect(USER_URL_THUMBNAIL_FALLBACK_DETAIL.length).toBeLessThanOrEqual(
      ASSISTANT_OPERATOR_LIMITS.maxReasonChars,
    )
  })

  it('一跳挂两张、只有第二张取不回来：失败按标题记到第二张头上', () => {
    const read = readBackBench({
      requested: [importUrl('#2'), importUrl('#3')],
      snapshot: withReferences(1),
      priorSteps: [fetchFailed('导入链接 #3')],
    })
    expect(read.mismatched).toBe(1)
    const [first, second] = read.text.split('\n').slice(1)
    expect(first).toContain('mounted (1/4')
    expect(first).toContain('(as requested)')
    expect(second).toContain('NOT CHANGED AS ASKED')
  })
})

describe('NovelAI 精确参考读回（Slice 4）', () => {
  const preciseRequest = (
    items: readonly {
      url: string
      kind: 'character' | 'style' | 'character&style' | 'outfit'
      strength: number
      preferSameOutfit?: boolean
    }[],
  ): BenchReadbackRequest =>
    ({
      tool: 'set_precise_references',
      title: '设精确参考',
      payload: { items: [...items] },
    }) as BenchReadbackRequest

  it('精确参考与快照完全一致时标为 as requested', () => {
    const items = [
      {
        url: 'https://cdn.test/char.png',
        kind: 'character' as const,
        strength: 1.5,
        preferSameOutfit: false,
      },
    ]
    const read = readBackBench({
      requested: [preciseRequest(items)],
      snapshot: {
        ...snapshot(),
        novelAiPreciseReferences: {
          items,
          kinds: ['character', 'style', 'character&style', 'outfit'],
          maxCount: 16,
          strength: { min: 0, max: 5, step: 0.05, default: 1 },
          supportsPreferSameOutfit: true,
          canCombineWithInpaint: false,
          supportsMultiCharacter: true,
          anlasEach: 5,
        },
      },
      priorSteps: [],
    })
    expect(read.mismatched).toBe(0)
    expect(read.text).toContain(
      '- precise references: 1 (character @ 1.5 sameOutfit=false) (as requested)',
    )
  })

  it('快照没留住（例如表单不支持或被重置）时报 NOT CHANGED AS ASKED', () => {
    const items = [
      {
        url: 'https://cdn.test/char.png',
        kind: 'character' as const,
        strength: 1.5,
      },
    ]
    const read = readBackBench({
      requested: [preciseRequest(items)],
      snapshot: snapshot(),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toContain(
      '- precise references: NOT CHANGED AS ASKED — requested 1 (character @ 1.5), actually (not supported on this model)',
    )
  })
})

describe('标签台提示词块读回（Prefix Artist Prompt Blocks）', () => {
  const blocksRequest = (
    blocks: readonly {
      id: string
      name: string
      enabled: boolean
      locked: boolean
      cursor: number
      target: 'positive' | 'negative'
      position: 'prefix' | 'suffix'
      mode: 'fixed' | 'sequential' | 'random'
      weight: number
      items: string[]
    }[],
  ): BenchReadbackRequest =>
    ({
      tool: 'set_prompt_blocks',
      title: '设提示词块',
      payload: { blocks: [...blocks] },
    }) as BenchReadbackRequest

  it('前置画师块与禁用旧块完全一致时标为 as requested', () => {
    const blocks = [
      {
        id: 'artist-1',
        name: '画师·星海夜车',
        enabled: true,
        locked: false,
        cursor: 0,
        target: 'positive' as const,
        position: 'prefix' as const,
        mode: 'fixed' as const,
        weight: 1,
        items: ['0.8::artist:rella::', '0.55::artist:guweiz::'],
      },
      {
        id: 'expr-1',
        name: '表情',
        enabled: false,
        locked: false,
        cursor: 0,
        target: 'positive' as const,
        position: 'suffix' as const,
        mode: 'random' as const,
        weight: 1,
        items: ['smile', 'blush'],
      },
    ]
    const read = readBackBench({
      requested: [blocksRequest(blocks)],
      snapshot: {
        ...snapshot(),
        tagPromptBlocks: blocks,
      },
      priorSteps: [],
    })
    expect(read.mismatched).toBe(0)
    expect(read.text).toContain(
      '- prompt blocks: 1 active / 2 (画师·星海夜车[on,prefix], 表情[off,suffix]) (as requested)',
    )
  })

  it('快照未落回（非标签台或未更新）时报 NOT CHANGED AS ASKED', () => {
    const blocks = [
      {
        id: 'artist-1',
        name: '画师·星海夜车',
        enabled: true,
        locked: false,
        cursor: 0,
        target: 'positive' as const,
        position: 'prefix' as const,
        mode: 'fixed' as const,
        weight: 1,
        items: ['0.8::artist:rella::'],
      },
    ]
    const read = readBackBench({
      requested: [blocksRequest(blocks)],
      snapshot: snapshot(),
      priorSteps: [],
    })
    expect(read.mismatched).toBe(1)
    expect(read.text).toContain(
      '- prompt blocks: NOT CHANGED AS ASKED — requested 1 active / 1 (画师·星海夜车[on,prefix]), actually (not on tag bench)',
    )
  })
})
