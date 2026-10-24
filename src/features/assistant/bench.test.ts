import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-image.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-lora.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-cards.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-bench.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-steps.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-look.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-watch.service', () => ({}))

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'

import {
  isHomeDraftSnapshot,
  renderBench,
  runEdit,
  toV3Mutation,
} from './bench'

/** 首页那份小配方（第 9g 步）：会话在首页、这一轮照图片台跑。 */
function homeDraftContext(): V3Context {
  return {
    face: 'image',
    request: {
      domain: 'image',
      workspaceKey: 'home',
      snapshot: {
        prompt: 'a cat at sunset',
        negativePrompt: '',
        model: { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
        availableModels: [
          { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
        ],
        specs: {
          aspectRatio: '9:16',
          resolution: null,
          qualityOptions: [],
          backgroundOptions: [],
          aspectRatioOptions: ['1:1', '9:16'],
          resolutionOptions: [],
        },
        count: { value: 1, options: [1, 2, 4] },
      },
    },
    prepared: {
      run: { state: { prompt: 'a cat at sunset', negativePrompt: '' } },
    },
  } as unknown as V3Context
}

async function drain<T>(run: AsyncGenerator<unknown, T>): Promise<T> {
  for (;;) {
    const next = await run.next()
    if (next.done) return next.value
  }
}

describe('首页那份小配方（第 9g 步）', () => {
  it('快照带规格与张数才算有配方', () => {
    const draft = homeDraftContext().request.snapshot
    expect(isHomeDraftSnapshot(draft)).toBe(true)
    expect(isHomeDraftSnapshot({ prompt: '', availableModels: [] })).toBe(false)
  })

  it('板子按首页写：说清在对话里出图、能改哪几格，下面接配方本身', () => {
    const board = renderBench(homeDraftContext(), [], '来张猫')
    expect(board.startsWith('HOME — no bench is open')).toBe(true)
    expect(board).toContain(
      'edit ops on the draft: prompt, model, specs, count, add_reference, remove_reference, apply_recipe',
    )
    expect(board).toContain('THE DRAFT — what is in it right now.')
    expect(board).not.toContain('IMAGE WORKBENCH — this is the form')
    expect(board).toContain('a cat at sunset')
  })

  it('配方里没有的那一格（负面词、模型参数）退回并列出这里有的', async () => {
    const result = await drain(
      runEdit(homeDraftContext(), [
        { op: 'negative', mode: 'replace', text: 'blurry' },
        { op: 'option', key: 'quality', value: 'high' },
      ]),
    )
    expect(result.error).toBe(true)
    expect(result.output).toContain('"negative" is not a control')
    expect(result.output).toContain('"option" is not a control')
    expect(result.output).toContain(
      'prompt, model, specs, count, add_reference, remove_reference, apply_recipe',
    )
  })
})

describe('新工具的一条改动 → v3 执行函数的入参', () => {
  it('提示词：给了 edits 没写 mode 当成「找句换句」', () => {
    expect(
      toV3Mutation('image', {
        op: 'prompt',
        edits: [{ find: 'girl', replace: 'boy' }],
      }),
    ).toEqual({
      tool: 'write',
      input: {
        writes: [
          {
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [{ find: 'girl', replace: 'boy' }],
          },
        ],
      },
    })
  })

  it('LoRA 参数：别名认得，只动那一格', () => {
    expect(
      toV3Mutation('lora', { op: 'lora_param', key: 'Guidance', value: '6.5' }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'set_params',
            steps: null,
            cfg: 6.5,
            seed: null,
            width: null,
            height: null,
            sampler: null,
            scheduler: null,
          },
        ],
      },
    })
  })

  it('台上没有的那一格回一句说明，列出这台有的（⛔ 不抛）', () => {
    const mutation = toV3Mutation('lora', { op: 'count', count: 2 })
    expect(mutation.tool).toBeNull()
    expect(mutation.tool === null && mutation.error).toContain(
      '"count" is not a control on this bench',
    )
    expect(mutation.tool === null && mutation.error).toContain('add_lora')
    const cards = toV3Mutation('cards', { op: 'prompt', text: 'x' })
    expect(cards.tool === null && cards.error).toContain('on this page')
  })

  it('视频台：时长随尺寸一起、首尾帧走 slot', () => {
    expect(
      toV3Mutation('video', {
        op: 'specs',
        duration: 5.2,
        aspectRatio: '16:9',
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'set_specs',
            duration: 5,
            aspectRatio: '16:9',
            resolution: null,
          },
        ],
      },
    })
    expect(
      toV3Mutation('video', {
        op: 'add_reference',
        picture: 'gen-1',
        slot: 'first',
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [{ op: 'mount_reference', asset: 'gen-1', slot: 'first' }],
      },
    })
    expect(toV3Mutation('video', { op: 'count', count: 2 }).tool).toBeNull()
  })

  it('角色页：提议设定补齐可空的那几格', () => {
    expect(
      toV3Mutation('cards', {
        op: 'propose_profile',
        character: 'char-b27ce8',
        fields: [{ field: 'look', text: 'silver hair' }],
      }),
    ).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'propose_profile',
            character: 'char-b27ce8',
            say: '',
            fields: [
              {
                field: 'look',
                text: 'silver hair',
                source: '',
                sourceUrl: null,
                added: null,
              },
            ],
          },
        ],
      },
    })
  })

  it('缺必需那一格说清是哪一格', () => {
    expect(toV3Mutation('image', { op: 'option', key: 'style' })).toEqual({
      tool: null,
      error: 'option needs value.',
    })
  })
})
