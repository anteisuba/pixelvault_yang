import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { V3Context } from '@/features/assistant/services/assistant-v3-steps.service'
import { toWorkingState } from '@/features/assistant/services/assistant-operator-run.service'
import type {
  AssistantOperatorEvent,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'

import {
  ASK_ABOUT_UNLANDED,
  benchReadbackOutput,
  renderBench,
  runEdit,
  runLook,
} from './bench'
import { AI_MODELS } from '@/constants/models'
import { buildOperatorNovelAiPreciseReferences } from '@/lib/studio-operator-snapshot'

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

/** 浏览器落完之后带回来的那份快照（只改动过的几格）。 */
function landedSnapshot(change: {
  aspectRatio?: string
  prompt?: string
  count?: number
}): AssistantOperatorSnapshot {
  const base = imageBenchSnapshot()
  return {
    ...base,
    prompt: change.prompt ?? base.prompt,
    specs: base.specs
      ? {
          ...base.specs,
          aspectRatio: change.aspectRatio ?? base.specs.aspectRatio,
        }
      : base.specs,
    count: base.count
      ? { ...base.count, value: change.count ?? base.count.value }
      : base.count,
  }
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
    // 11-18：当场不替表单说「现在是什么样」—— 交给浏览器落的那一格记进 readback。
    expect(result.output).not.toContain('BENCH NOW')
    expect(result.readback?.map((entry) => entry.tool)).toEqual(['set_specs'])
    // 下一跳：浏览器带回落下之后的快照，按它读回。
    const landed = imageBenchContext(landedSnapshot({ aspectRatio: '16:9' }))
    const read = benchReadbackOutput(landed, result.readback ?? [])
    expect(read.mismatched).toBe(0)
    expect(read.output).toContain('aspect ratio: 16:9 (as requested)')
    expect(read.output).toContain('aspect ratio 16:9')
  })

  it('浏览器落完台上仍是 1:1（11-18 真机）：读回写「请求 16:9，实际 1:1」，不说改好了', async () => {
    const context = imageBenchContext()
    const { result } = await drain(
      runEdit(context, [{ op: 'specs', aspectRatio: '16:9' }]),
    )
    const stale = imageBenchContext(imageBenchSnapshot())
    const read = benchReadbackOutput(stale, result.readback ?? [])
    expect(read.mismatched).toBe(1)
    expect(read.output).toMatch(
      /aspect ratio: NOT CHANGED AS ASKED — requested 16:9, actually 1:1/,
    )
    expect(read.output).toContain('aspect ratio 1:1')
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
    // 提示词交给浏览器落：读回下一跳做；比例当场被拒，不在 readback 里。
    expect(result.readback?.map((entry) => entry.tool)).toEqual(['set_prompt'])
    expect(context.prepared.run.state.prompt).toBe(
      '一只橘猫趴在窗台上，午后阳光。',
    )
    const landed = imageBenchContext(
      landedSnapshot({ prompt: '一只橘猫趴在窗台上，午后阳光。' }),
    )
    const read = benchReadbackOutput(landed, result.readback ?? [])
    expect(read.mismatched).toBe(0)
    expect(read.output).toContain('aspect ratio 1:1')
  })

  it('要的值被拒（11-18 真机 7:3 / 9 张）：记下几格没落成、被拒步带上「哪一格 · 要的 · 仍是 · 可选」、回执叫她先问', async () => {
    const context = imageBenchContext()
    const { result, events } = await drain(
      runEdit(context, [
        { op: 'prompt', mode: 'replace', text: '一只橘猫跳上窗台' },
        { op: 'specs', aspectRatio: '7:3' },
        { op: 'count', count: 9 },
      ]),
    )
    // 半成：不是全军覆没（error=false），但两格没落成。
    expect(result.error).toBe(false)
    expect(result.unlanded).toBe(2)
    expect(result.output).toContain(ASK_ABOUT_UNLANDED)
    const values = events.flatMap((event) =>
      event.type === 'step' &&
      event.step.status === 'error' &&
      event.step.error.value
        ? [event.step.error.value]
        : [],
    )
    expect(values).toEqual([
      expect.objectContaining({
        field: 'aspectRatio',
        requested: '7:3',
        current: '1:1',
      }),
      expect.objectContaining({ field: 'count', requested: '9' }),
    ])
    expect(values[0]?.options).toContain('16:9')
    expect(values[1]?.options.length).toBeGreaterThan(0)
  })

  it('全都落成：不记 unlanded、回执里没有「先问」那一句', async () => {
    const { result } = await drain(
      runEdit(imageBenchContext(), [{ op: 'count', count: 2 }]),
    )
    expect(result.unlanded).toBeUndefined()
    expect(result.output).not.toContain(ASK_ABOUT_UNLANDED)
  })

  it('改完的回执带上这一批的估价（与出图键旁那个数同一个算式）', async () => {
    const context = imageBenchContext()
    const { result } = await drain(
      runEdit(context, [{ op: 'count', count: 2 }]),
    )
    const landed = imageBenchContext(landedSnapshot({ count: 2 }))
    const read = benchReadbackOutput(landed, result.readback ?? [])
    expect(read.output).toContain('2 per run')
    expect(read.output).toMatch(/about \$0\.0[0-9]+ per run/)
  })

  it('板子上直接印价钱，并说清问价不必调 generate', () => {
    const board = renderBench(imageBenchContext(), [], '这样出一张多少钱')
    expect(board).toMatch(/Price: about \$0\.0[0-9]+ per run/)
    expect(board).toContain('never call generate just to show a price')
  })
})

describe('标签台 NovelAI Precise Reference 全链路（Slice 4）', () => {
  function naiSnapshot(
    modelId: string,
    overrides: Partial<AssistantOperatorSnapshot> = {},
  ): AssistantOperatorSnapshot {
    const precise = buildOperatorNovelAiPreciseReferences(
      [{ modelId }],
      overrides.novelAiPreciseReferences?.items,
    )
    return {
      prompt: '1girl, solo',
      negativePrompt: '',
      model: { id: modelId, label: modelId },
      availableModels: [
        { id: AI_MODELS.NOVELAI_V5_FULL, label: 'NovelAI V5 Full' },
        {
          id: AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
          label: 'NovelAI V5 Full Medium',
        },
        { id: AI_MODELS.NOVELAI_V45_FULL, label: 'NovelAI V4.5 Full' },
      ],
      specs: {
        aspectRatio: '1:1',
        resolution: null,
        qualityOptions: [],
        backgroundOptions: [],
        aspectRatioOptions: ['1:1', '16:9', '9:16'],
        resolutionOptions: [],
      },
      count: { value: 1, options: [1, 2] },
      references: {
        items: [{ url: 'https://cdn.test/base.png', label: 'base-pose' }],
        limit: 1,
      },
      results: [{ url: 'https://cdn.test/res1.png', label: 'res-1' }],
      ...(precise ? { novelAiPreciseReferences: precise } : {}),
      ...overrides,
    } as AssistantOperatorSnapshot
  }

  function naiContext(
    snapshot: AssistantOperatorSnapshot,
    mentionedAssets: { id: string; url: string; label: string }[] = [
      {
        id: 'att-1',
        url: 'https://cdn.test/outfit.png',
        label: 'dress.png',
      },
    ],
  ): V3Context {
    const request = {
      domain: 'image',
      workspaceKey: 'image-tags',
      snapshot,
      mentionedAssets,
      messages: [{ role: 'user', content: '用精确参考锁人物和服装' }],
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
      seesImages: true,
      pictures: {
        maxBytes: 20_000_000,
        loads: new Map([
          [
            'https://cdn.test/char.png',
            Promise.resolve({
              data: Buffer.from([]),
              mediaType: 'image/png',
              width: 512,
              height: 512,
            }),
          ],
        ]),
      },
      clipTier: false,
      clips: { maxBytes: 20_000_000, loads: new Map() },
      prepared: {
        user: { id: 'user_test' },
        route: { adapterType: 'openai' },
        run: {
          userId: 'user_test',
          request,
          state: toWorkingState(snapshot),
          nextKernel: true,
          stepSeq: 0,
          ledgerSteps: 0,
          roundLedger: { facts: [], decisions: [], todos: [], evidence: [] },
          searchIndex: new Map(),
          executedStepKeys: new Set(),
          assistantWrittenFields: new Set(),
          researchSnippets: new Map(),
          workingMemoryIndex: new Map(),
        },
        persona: {},
      },
    } as unknown as V3Context
  }

  it('V5 Full 支持按句柄设置多张精确参考、回写读回与 +5N Anlas 报价', async () => {
    const context = naiContext(naiSnapshot(AI_MODELS.NOVELAI_V5_FULL))
    const { result } = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [
            {
              picture: 'result-1',
              kind: 'character',
              strength: 1.5,
              preferSameOutfit: false,
            },
            {
              picture: 'dress.png',
              kind: 'outfit',
              strength: 1.2,
            },
          ],
        },
      ]),
    )
    expect(result.error).toBe(false)
    expect(result.readback?.map((entry) => entry.tool)).toEqual([
      'set_precise_references',
    ])
    expect(context.prepared.run.state.novelAiPreciseReferences?.items).toEqual([
      {
        url: 'https://cdn.test/res1.png',
        kind: 'character',
        strength: 1.5,
        preferSameOutfit: false,
      },
      {
        url: 'https://cdn.test/outfit.png',
        kind: 'outfit',
        strength: 1.2,
      },
    ])

    const landed = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        novelAiPreciseReferences:
          context.prepared.run.state.novelAiPreciseReferences,
      }),
    )
    const read = benchReadbackOutput(landed, result.readback ?? [])
    expect(read.mismatched).toBe(0)
    expect(read.output).toContain('precise references: 2')
    expect(read.output).toContain('+10 Anlas/image')
    expect(read.output).toContain('Precise Reference adds +10 Anlas per image')

    const board = renderBench(landed, [], '现在是什么状态')
    expect(board).toContain(
      'precise-1: character · strength 1.5 · preferSameOutfit false',
    )
    expect(board).toContain('precise-2: outfit · strength 1.2')
    expect(board).toContain('+10 Anlas per image')
  })

  it('用 precise-1 修改参数时保留原 id 和 source，且清空 [] 正常工作', async () => {
    const initial = buildOperatorNovelAiPreciseReferences(
      [{ modelId: AI_MODELS.NOVELAI_V5_FULL }],
      [
        {
          id: 'pr-keep',
          url: 'https://cdn.test/card-char.png',
          kind: 'character',
          strength: 1,
          preferSameOutfit: true,
          source: { type: 'card', cardId: 'c1', lookId: 'l1' },
        },
      ],
    )
    const context = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        novelAiPreciseReferences: initial,
      }),
    )
    const updated = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [
            { picture: 'precise-1', kind: 'character', strength: 2.2 },
          ],
        },
      ]),
    )
    expect(updated.result.error).toBe(false)
    expect(context.prepared.run.state.novelAiPreciseReferences?.items).toEqual([
      {
        id: 'pr-keep',
        url: 'https://cdn.test/card-char.png',
        kind: 'character',
        strength: 2.2,
        preferSameOutfit: true,
        source: { type: 'card', cardId: 'c1', lookId: 'l1' },
      },
    ])

    const cleared = await drain(
      runEdit(context, [{ op: 'precise_references', preciseReferences: [] }]),
    )
    expect(cleared.result.error).toBe(false)
    expect(context.prepared.run.state.novelAiPreciseReferences?.items).toEqual(
      [],
    )
  })

  it('禁止模型直接传原始 URL', async () => {
    const context = naiContext(naiSnapshot(AI_MODELS.NOVELAI_V5_FULL))
    const { result } = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [
            { picture: 'https://evil.example/a.png', kind: 'style' },
          ],
        },
      ]),
    )
    expect(result.error).toBe(true)
    expect(result.output).toContain('Never pass a raw URL')
  })

  it('V4.5 拒绝 outfit / preferSameOutfit / 超范围 strength，支持 fidelity', async () => {
    const context = naiContext(naiSnapshot(AI_MODELS.NOVELAI_V45_FULL))
    const badKind = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [{ picture: 'dress.png', kind: 'outfit' }],
        },
      ]),
    )
    expect(badKind.result.error).toBe(true)
    expect(badKind.result.output).toContain('unsupported kind "outfit"')

    const badStrength = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [
            { picture: 'dress.png', kind: 'style', strength: 2.5 },
          ],
        },
      ]),
    )
    expect(badStrength.result.error).toBe(true)
    expect(badStrength.result.output).toContain('(0–1)')

    const ok = await drain(
      runEdit(context, [
        {
          op: 'precise_references',
          preciseReferences: [
            {
              picture: 'dress.png',
              kind: 'style',
              strength: 0.8,
              fidelity: 0.7,
            },
          ],
        },
      ]),
    )
    expect(ok.result.error).toBe(false)
    expect(context.prepared.run.state.novelAiPreciseReferences?.items).toEqual([
      {
        url: 'https://cdn.test/outfit.png',
        kind: 'style',
        strength: 0.8,
        fidelity: 0.7,
      },
    ])
  })

  it('V5 Full 拒绝 fidelity 和对 style/outfit 设 preferSameOutfit；V5 Full Medium 整条拒绝', async () => {
    const v5 = naiContext(naiSnapshot(AI_MODELS.NOVELAI_V5_FULL))
    const badFidelity = await drain(
      runEdit(v5, [
        {
          op: 'precise_references',
          preciseReferences: [
            { picture: 'dress.png', kind: 'style', fidelity: 0.5 },
          ],
        },
      ]),
    )
    expect(badFidelity.result.error).toBe(true)
    expect(badFidelity.result.output).toContain(
      'fidelity is only supported on NovelAI V4.5',
    )

    const badOutfitFlag = await drain(
      runEdit(v5, [
        {
          op: 'precise_references',
          preciseReferences: [
            { picture: 'dress.png', kind: 'outfit', preferSameOutfit: true },
          ],
        },
      ]),
    )
    expect(badOutfitFlag.result.error).toBe(true)
    expect(badOutfitFlag.result.output).toContain(
      'preferSameOutfit only applies to character or character&style',
    )

    const medium = naiContext(naiSnapshot(AI_MODELS.NOVELAI_V5_FULL_MEDIUM))
    const refused = await drain(
      runEdit(medium, [
        {
          op: 'precise_references',
          preciseReferences: [{ picture: 'dress.png', kind: 'character' }],
        },
      ]),
    )
    expect(refused.result.error).toBe(true)
    expect(refused.result.output).toContain(
      'Precise Reference is not supported',
    )
  })

  it('同一轮内切换模型时同步刷新 novelAiPreciseReferences 契约与列表', async () => {
    const initial = buildOperatorNovelAiPreciseReferences(
      [{ modelId: AI_MODELS.NOVELAI_V5_FULL }],
      [
        {
          url: 'https://cdn.test/char.png',
          kind: 'character',
          strength: 2.5,
          preferSameOutfit: false,
        },
        {
          url: 'https://cdn.test/outfit.png',
          kind: 'outfit',
          strength: 1.5,
        },
      ],
    )
    const context = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        novelAiPreciseReferences: initial,
      }),
    )

    // 切到 V4.5：剔除 outfit、钳制 strength 到 1、补齐 fidelity、移除 preferSameOutfit
    await drain(
      runEdit(context, [{ op: 'model', model: AI_MODELS.NOVELAI_V45_FULL }]),
    )
    expect(context.prepared.run.state.novelAiPreciseReferences?.kinds).toEqual([
      'character',
      'style',
      'character&style',
    ])
    expect(context.prepared.run.state.novelAiPreciseReferences?.items).toEqual([
      {
        url: 'https://cdn.test/char.png',
        kind: 'character',
        strength: 1,
        fidelity: 1,
      },
    ])

    // 再切到 V5 Full Medium：整节消失
    await drain(
      runEdit(context, [
        { op: 'model', model: AI_MODELS.NOVELAI_V5_FULL_MEDIUM },
      ]),
    )
    expect(context.prepared.run.state.novelAiPreciseReferences).toBeUndefined()
  })

  it('look "precise-1" 能直接把精确参考图摆到模型眼前', async () => {
    const initial = buildOperatorNovelAiPreciseReferences(
      [{ modelId: AI_MODELS.NOVELAI_V5_FULL }],
      [
        {
          url: 'https://cdn.test/char.png',
          kind: 'character',
          strength: 1.2,
        },
      ],
    )
    const context = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        novelAiPreciseReferences: initial,
      }),
    )
    const { result } = await drain(
      runLook(
        context,
        { names: ['precise-1'], question: '看看角色' },
        [],
        '看看精确参考',
      ),
    )
    expect(result.error).toBe(false)
    expect(result.pictures).toEqual([
      {
        url: 'https://cdn.test/char.png',
        label: 'precise-1 (character, strength 1.2)',
      },
    ])
  })

  it('标签台支持用 prompt_blocks 写入前置画师块、静音冲突旧块并渲染在看板里', async () => {
    const existing = [
      {
        id: 'expr-old',
        name: '表情',
        enabled: true,
        locked: false,
        cursor: 0,
        target: 'positive' as const,
        position: 'suffix' as const,
        mode: 'random' as const,
        weight: 1,
        items: ['smile', 'blush'],
      },
    ]
    const context = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        tagPromptBlocks: existing,
        capabilities: [
          {
            key: 'ucPreset',
            kind: 'select',
            value: 'heavy',
            options: ['heavy', 'light', 'none'],
            available: true,
          },
          {
            key: 'qualityToggle',
            kind: 'toggle',
            value: true,
            available: true,
          },
        ],
      }),
    )

    const beforeBoard = renderBench(context, [], '帮我配画师串')
    expect(beforeBoard).toContain('Prompt blocks')
    expect(beforeBoard).toContain('表情')
    expect(beforeBoard).toContain('app auto-prepends this UC preset')
    expect(beforeBoard).toContain('app auto-appends quality tags')

    const { result, events } = await drain(
      runEdit(context, [
        {
          op: 'prompt_blocks',
          promptBlocks: [
            {
              name: '画师·夜雨星轨',
              enabled: true,
              target: 'positive',
              position: 'prefix',
              mode: 'fixed',
              weight: 1,
              items: ['0.8::artist:rella::', '0.55::artist:guweiz::'],
            },
            {
              id: 'expr-old',
              name: '表情',
              enabled: false,
              target: 'positive',
              position: 'suffix',
              mode: 'random',
              weight: 1,
              items: ['smile', 'blush'],
            },
          ],
        },
      ]),
    )

    expect(result.error).toBe(false)
    expect(context.prepared.run.state.tagPromptBlocks).toHaveLength(2)
    expect(context.prepared.run.state.tagPromptBlocks?.[0]?.position).toBe(
      'prefix',
    )
    expect(context.prepared.run.state.tagPromptBlocks?.[1]?.enabled).toBe(false)
    expect(
      events.some(
        (event) =>
          event.type === 'step' && event.step.tool === 'set_prompt_blocks',
      ),
    ).toBe(true)

    const landed = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, {
        tagPromptBlocks: context.prepared.run.state.tagPromptBlocks,
      }),
    )
    const read = benchReadbackOutput(landed, result.readback ?? [])
    expect(read.mismatched).toBe(0)
    expect(read.output).toContain('画师·夜雨星轨[on,prefix]')
    expect(read.output).toContain('表情[off,suffix]')
  })

  it('prompt_blocks 拒绝非标签台调用以及块内含中文标签', async () => {
    const nonTagContext = imageBenchContext()
    const notTagBench = await drain(
      runEdit(nonTagContext, [
        {
          op: 'prompt_blocks',
          promptBlocks: [
            {
              name: '画师',
              enabled: true,
              target: 'positive',
              position: 'prefix',
              mode: 'fixed',
              weight: 1,
              items: ['artist:rella'],
            },
          ],
        },
      ]),
    )
    expect(notTagBench.result.error).toBe(true)

    const tagContext = naiContext(
      naiSnapshot(AI_MODELS.NOVELAI_V5_FULL, { tagPromptBlocks: [] }),
    )
    const badCjk = await drain(
      runEdit(tagContext, [
        {
          op: 'prompt_blocks',
          promptBlocks: [
            {
              name: '画师',
              enabled: true,
              target: 'positive',
              position: 'prefix',
              mode: 'fixed',
              weight: 1,
              items: ['星光画风'],
            },
          ],
        },
      ]),
    )
    expect(badCjk.result.error).toBe(true)
  })
})
