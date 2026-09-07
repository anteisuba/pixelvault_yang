import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { ASSISTANT_MENTION_LIMITS } from '@/constants/generation-naming'
import {
  buildGenerationTag,
  deriveGenerationSerial,
  formatGenerationSerial,
} from '@/lib/generation-name'

/**
 * `@` 那条 chip 管线的回归闸（`pages/assistant-shell.md` §3.3 / §7）。
 *
 * 钉五件事：
 *  ① 触发解析的三条判据（行首/空白之后、token 里不许有空白、只看光标之前）——
 *    漏掉第一条的表现是写邮箱地址时一路弹选择器；
 *  ② 选中之后 `@token` 从草稿里剪掉（chip 才是引用的载体）；
 *  ③ chip 按 id 去重 —— 四个入口都可能指向同一张图，重复会让「将看 N 张」说谎；
 *  ④ 「将看 N 张」超过 8 转 warning，**但不拦不截**（owner 2026-09-06）；
 *  ⑤ 拖进来的东西：库内资产（`ASSET_DND_MIME`）成 chip，其余原样交回上传通道；
 *  ⑥ 正文里直接写产物名（`@图_012`）也成 chip —— 名字命中 / 未知名字 / 超限
 *    三条（切片 N1）。
 */

const fetchGenerationByIdAPI = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client/gallery', () => ({ fetchGenerationByIdAPI }))

/** store 是模块级单例 —— 每个用例换一份新的（照抄驱动 hook 用例的头注）。 */
type Mention = typeof import('@/hooks/use-studio-operator-mention')

let mention: Mention

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mention = await import('@/hooks/use-studio-operator-mention')
})

function chip(id: string) {
  return {
    id,
    url: `https://cdn.test/${id}.png`,
    label: id,
    kind: 'image' as const,
  }
}

function render() {
  return renderHook(() => mention.useStudioOperatorMention())
}

describe('readMentionTrigger', () => {
  it('行首与空白之后的 @ 才算 —— 邮箱地址中间那个不算', () => {
    expect(mention.readMentionTrigger('@海报')).toEqual({
      start: 0,
      caret: 3,
      query: '海报',
    })
    expect(mention.readMentionTrigger('画一张 @海报')?.query).toBe('海报')
    // ⛔ `a@b.com` 不该在打字过程中弹选择器。
    expect(mention.readMentionTrigger('me@example.com')).toBeNull()
  })

  it('token 里出现空白就不再是触发（用户已经接着写句子了）', () => {
    expect(mention.readMentionTrigger('@海报 再来一张')).toBeNull()
  })

  it('只看光标之前 —— 回头改字时触发的是就近那个 @', () => {
    const text = '@第一 中间 @第二'
    expect(mention.readMentionTrigger(text, 3)?.query).toBe('第一')
    expect(mention.readMentionTrigger(text)?.query).toBe('第二')
  })
})

describe('useStudioOperatorMention', () => {
  it('选中之后把 @token 从草稿里剪掉，并加一枚 chip', () => {
    const { result } = render()

    act(() => {
      result.current.syncDraft('这张 @海 报要改', 5)
    })
    expect(result.current.trigger?.query).toBe('海')

    let next = ''
    act(() => {
      next = result.current.pick('这张 @海 报要改', chip('g1'))
    })
    // 「这张 」+「 报要改」——⛔ 草稿里不留 `@海`，否则句子与附件说的不是一回事。
    expect(next).toBe('这张  报要改')
    expect(result.current.chips.map((item) => item.id)).toEqual(['g1'])
    expect(result.current.trigger).toBeNull()
  })

  it('chip 按 id 去重；摘掉一枚只摘那一枚', () => {
    const { result } = render()

    act(() => {
      result.current.addChip(chip('g1'))
      result.current.addChip(chip('g1'))
      result.current.addChip(chip('g2'))
    })
    expect(result.current.count).toBe(2)

    act(() => {
      result.current.removeChip('g1')
    })
    expect(result.current.chips.map((item) => item.id)).toEqual(['g2'])
  })

  it('超过 8 张只把计数转 warning —— ⛔ 不拦截、⛔ 不截断', () => {
    const { result } = render()

    act(() => {
      for (let index = 0; index < 9; index += 1) {
        result.current.addChip(chip(`g${index}`))
      }
    })
    expect(result.current.count).toBe(9)
    expect(result.current.overLimit).toBe(true)
    // ⭐ 九张**全都在**：软截断（只留 8 张）是这条用例要挡的那种失败。
    expect(result.current.chips).toHaveLength(9)
  })

  it('Esc 关掉的是这一个 @：继续打字不再弹，换一个新的 @ 才重新弹', () => {
    const { result } = render()

    act(() => {
      result.current.syncDraft('@海')
    })
    expect(result.current.trigger).not.toBeNull()

    act(() => {
      result.current.closePicker()
    })
    expect(result.current.trigger).toBeNull()

    // 继续往这个 @ 后面打字 —— 还是关着（用户已经说了不要）。
    act(() => {
      result.current.syncDraft('@海报')
    })
    expect(result.current.trigger).toBeNull()

    // 另起一个 @（下标不同）—— 那是一次新的意图。
    act(() => {
      result.current.syncDraft('@海报 @人')
    })
    expect(result.current.trigger?.query).toBe('人')
  })

  it('拖库内资产进来 → 解析成 chip，⛔ 不回落到上传通道', async () => {
    fetchGenerationByIdAPI.mockResolvedValue({
      success: true,
      data: {
        id: 'g9',
        url: 'https://cdn.test/g9.png',
        thumbnailUrl: 'https://cdn.test/g9-thumb.png',
        prompt: '夜景海报',
        model: 'x',
        outputType: 'IMAGE',
      },
    })
    const { result } = render()

    let files: readonly File[] = []
    await act(async () => {
      files = result.current.acceptDrop({
        getData: (type: string) =>
          type === ASSET_DND_MIME ? JSON.stringify(['g9']) : '',
        files: [],
      } as unknown as DataTransfer)
      await Promise.resolve()
    })

    expect(files).toHaveLength(0)
    expect(fetchGenerationByIdAPI).toHaveBeenCalledWith('g9')
    expect(result.current.chips.map((item) => item.id)).toEqual(['g9'])
    expect(result.current.chips[0]?.thumbnailUrl).toBe(
      'https://cdn.test/g9-thumb.png',
    )
  })

  it('拖本地文件进来 → 原样交回上传通道（⛔ 这里不自己传）', () => {
    const { result } = render()
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    let files: readonly File[] = []
    act(() => {
      files = result.current.acceptDrop({
        getData: () => '',
        files: [file],
      } as unknown as DataTransfer)
    })

    expect(files).toEqual([file])
    expect(fetchGenerationByIdAPI).not.toHaveBeenCalled()
    expect(result.current.chips).toHaveLength(0)
  })
})

describe('syncNameMentions（正文里直接写产物名）', () => {
  it('名字命中最近生成 → 成 chip', () => {
    const { result } = render()
    const candidate = chip('g1')

    let added: readonly { id: string }[] = []
    act(() => {
      added = result.current.syncNameMentions(
        `把 @${buildGenerationTag({ id: 'g1' })} 换个背景`,
        [candidate],
      )
    })

    expect(added.map((item) => item.id)).toEqual(['g1'])
    expect(result.current.chips.map((item) => item.id)).toEqual(['g1'])
  })

  it('未知名字 ⛔ 不成 chip（⛔ 也不静默挂一张别的）', () => {
    const { result } = render()
    const unknown = (deriveGenerationSerial('g1') + 500) % 1000

    act(() => {
      result.current.syncNameMentions(
        `@图_${formatGenerationSerial(unknown)}`,
        [chip('g1')],
      )
    })

    expect(result.current.chips).toHaveLength(0)
  })

  it('同一个名字继续打字不会重复上报（chip 也只有一张）', () => {
    const { result } = render()
    const tag = buildGenerationTag({ id: 'g1' })

    act(() => {
      result.current.syncNameMentions(`@${tag}`, [chip('g1')])
    })
    let again: readonly { id: string }[] = []
    act(() => {
      again = result.current.syncNameMentions(`@${tag} 再来`, [chip('g1')])
    })

    expect(again).toHaveLength(0)
    expect(result.current.chips).toHaveLength(1)
  })

  it(`一条消息最多解析 ${ASSISTANT_MENTION_LIMITS.maxPerMessage} 个名字`, () => {
    const { result } = render()
    // 序号互不相同的一批候选（撞号的丢掉，用例要的是「够多」而不是「正好」）。
    const candidates: ReturnType<typeof chip>[] = []
    const seen = new Set<number>()
    for (let index = 0; candidates.length < 14 && index < 200; index += 1) {
      const id = `g-${index}`
      const serial = deriveGenerationSerial(id)
      if (seen.has(serial)) continue
      seen.add(serial)
      candidates.push(chip(id))
    }
    const text = candidates
      .map((item) => `@${buildGenerationTag({ id: item.id })}`)
      .join(' ')

    act(() => {
      result.current.syncNameMentions(text, candidates)
    })

    expect(result.current.chips).toHaveLength(
      ASSISTANT_MENTION_LIMITS.maxPerMessage,
    )
  })
})
