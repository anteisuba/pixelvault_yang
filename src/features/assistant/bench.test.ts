import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-image.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-lora.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-cards.service', () => ({}))
const runWebFind = vi.hoisted(() => vi.fn())
vi.mock('@/services/kernel/assistant-v3-bench.service', () => ({ runWebFind }))
vi.mock('@/services/kernel/assistant-v3-steps.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-look.service', () => ({}))
vi.mock('@/services/kernel/assistant-v3-watch.service', () => ({}))

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'

import {
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
  const imageFind = {
    kind: 'image' as const,
    n: 1,
    imageUrl: 'https://example.com/draco.jpg',
    title: 'Draco Malfoy',
  }
  const videoFind = {
    kind: 'video' as const,
    n: 2,
    url: 'https://www.youtube.com/watch?v=abc',
    platform: 'youtube' as const,
    title: 'Draco scenes',
  }

  it('web_images / web_videos 走旧执行器那两步，号带回本轮记录，模型被叮嘱只用 #n', async () => {
    runWebFind.mockReset()
    runWebFind
      .mockImplementationOnce(async function* () {
        return {
          kind: 'result',
          output: '#1 · Draco Malfoy · example.com · usable as reference',
          error: false,
          finds: [imageFind],
        }
      })
      .mockImplementationOnce(async function* () {
        return {
          kind: 'result',
          output: '#2 · Draco scenes · YouTube',
          error: false,
          finds: [videoFind],
        }
      })
    const context = homeDraftContext()
    const result = await drain(
      runFind(context, {
        query: 'Draco Malfoy',
        kinds: ['web_images', 'web_videos'],
        subject: 'Harry Potter · Draco Malfoy',
      }),
    )
    expect(runWebFind).toHaveBeenNthCalledWith(
      1,
      context,
      'web_images',
      'Draco Malfoy',
      'Harry Potter · Draco Malfoy',
    )
    expect(runWebFind).toHaveBeenNthCalledWith(
      2,
      context,
      'web_videos',
      'Draco Malfoy',
      'Harry Potter · Draco Malfoy',
    )
    expect(result.error).toBe(false)
    expect(result.finds).toEqual([imageFind, videoFind])
    expect(result.output).toContain('#1 · Draco Malfoy')
    expect(result.output).toContain('refer to them by #n')
  })

  it('没给查询词不去联网，只说清要什么', async () => {
    runWebFind.mockReset()
    const result = await drain(
      runFind(homeDraftContext(), { query: '  ', kinds: ['web_images'] }),
    )
    expect(runWebFind).not.toHaveBeenCalled()
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
