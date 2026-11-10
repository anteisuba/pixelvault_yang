import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { V3Context } from '@/features/assistant/services/assistant-v3-steps.service'

import {
  isAttachedName,
  isHomeDraftSnapshot,
  renderBench,
  renderLibraryView,
  runEdit,
  runFind,
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
      persona: {},
    },
  } as unknown as V3Context
}

async function drain<T>(run: AsyncGenerator<unknown, T>): Promise<T> {
  for (;;) {
    const next = await run.next()
    if (next.done) return next.value
  }
}

describe('SPENDING 那一行：生成一律等创作者确认（owner 11-10）', () => {
  it('每批都摆确认卡，⛔ 不再写额度内直接出', () => {
    const board = renderBench(homeDraftContext(), [], '来张猫')
    expect(board).toContain(
      'every batch waits on a confirm card that shows the price',
    )
    expect(board).not.toContain('add up to at most')
    expect(board).not.toContain('start at once')
  })
})

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

  it('图片台：构思复杂度随规格一起带过去，没说的那几格是 null', () => {
    expect(toV3Mutation('image', { op: 'specs', complexity: 'low' })).toEqual({
      tool: 'edit',
      input: {
        ops: [
          {
            op: 'set_specs',
            aspectRatio: null,
            resolution: null,
            quality: null,
            background: null,
            complexity: 'low',
          },
        ],
      },
    })
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

describe('库开着、在看哪一样（10-26）', () => {
  it('没开库：板子底下什么都不加', () => {
    expect(renderLibraryView(undefined)).toBe('')
  })

  it('只开着库：说开着哪个库', () => {
    expect(renderLibraryView({ library: 'voices' })).toBe(
      '\nLIBRARY ON SCREEN: the creator has their voice library open next to this chat.',
    )
  })

  it('点开了一位角色：给出编号，「这个」就是她，先 look', () => {
    const line = renderLibraryView({
      library: 'cards',
      item: { kind: 'character', name: 'Denia' },
    })
    expect(line).toContain('character library open next to this chat')
    expect(line).toContain('looking at 角色·Denia')
    expect(line).toContain('look 角色·Denia before you answer')
  })

  it('图按身份段原样给，标签 / LoRA 带各自前缀', () => {
    expect(
      renderLibraryView({
        library: 'assets',
        item: { kind: 'picture', name: '图_012' },
      }),
    ).toContain('looking at 图_012.')
    expect(
      renderLibraryView({
        library: 'tags',
        item: { kind: 'tag', name: 'watercolor_(medium)' },
      }),
    ).toContain('标签·watercolor_(medium)')
    expect(
      renderLibraryView({
        library: 'lora',
        item: { kind: 'lora', name: 'Firefly' },
      }),
    ).toContain('LoRA·Firefly')
  })

  it('屏上那一页：范围、搜索词、屏上前几样与多选，都按编号写', () => {
    const line = renderLibraryView({
      library: 'assets',
      screen: {
        kind: 'picture',
        scope: 'folder 「夏日」',
        search: 'rain',
        total: 42,
        visible: ['图_001', '图_002'],
        selected: ['图_002'],
      },
    })
    expect(line).toContain('Showing: folder 「夏日」.')
    expect(line).toContain('Search box: "rain".')
    expect(line).toContain('On screen (first 2 of 42): 图_001, 图_002.')
    expect(line).toContain('Selected by the creator: 图_002.')
    expect(line).toContain('call open with library')
    expect(
      renderLibraryView({
        library: 'cards',
        screen: { kind: 'character', visible: ['Denia'] },
      }),
    ).toContain('角色·Denia')
  })

  it('任何一张脸的板子都接上这一句', () => {
    const context = homeDraftContext()
    const board = renderBench(
      {
        ...context,
        request: {
          ...context.request,
          libraryView: {
            library: 'cards',
            item: { kind: 'character', name: 'Denia' },
          },
        },
      } as V3Context,
      [],
      '这个角色的设定怎么完善',
    )
    expect(board).toContain('look 角色·Denia before you answer.')
    // 角色库开着（第 ⑩ 步）：改设定、找图都先出卡。
    expect(board.endsWith('say in one line what is on it.')).toBe(true)
  })
})

describe('find 联网找图 / 找视频（10-27「网上找的图片和视频发不过来」）', () => {
  it('没给查询词不去联网，只说清要什么', async () => {
    const result = await drain(
      runFind(homeDraftContext(), { query: '  ', kinds: ['web_images'] }),
    )
    expect(result.error).toBe(true)
    expect(result.output).toContain('needs a query')
  })
})

describe('看屏：屏上那几格按位置编号（10-30）', () => {
  it('扫到的格子：按号列出，带图的提醒先 look 屏幕', () => {
    const line = renderLibraryView({
      library: 'gallery',
      screen: {
        kind: 'gallery',
        visible: ['g1', 'g2'],
        tiles: [{ thumb: 'https://cdn/1.jpg', box: [0, 0, 0.2, 0.3] }, {}],
        viewport: { width: 1000, height: 800 },
      },
    })
    expect(line).toContain('gallery (public pictures by everyone) open')
    expect(line).toContain('numbered top-left first: 1 画廊·g1 · 2 画廊·g2.')
    expect(line).toContain('look 屏幕 first')
  })

  it('没图的格子（音色）：只列号，不提看屏', () => {
    const line = renderLibraryView({
      library: 'voices',
      screen: { kind: 'voice', visible: ['Aemeath'], tiles: [{}] },
    })
    expect(line).toContain('1 音色·Aemeath')
    expect(line).not.toContain('look 屏幕')
  })
})

describe('附图认名字（只写编号也认）', () => {
  it('全名或「·」前的编号都算同一张，别的不算', () => {
    expect(isAttachedName('图_1553·masterpi', '图_1553·masterpi')).toBe(true)
    expect(isAttachedName('图_1553·masterpi', '图_1553')).toBe(true)
    expect(isAttachedName('图_1553·masterpi', ' 图_1553 ')).toBe(true)
    expect(isAttachedName('图_1553·masterpi', '图_155')).toBe(false)
    expect(isAttachedName('图_1553·masterpi', '')).toBe(false)
  })
})
