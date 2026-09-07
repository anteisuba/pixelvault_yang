// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { setOperatorReviewState } from '@/hooks/use-studio-operator-store'
import { STUDIO_OPERATOR_MENTION } from '@/constants/studio-assistant-operator'
import {
  buildGenerationDisplayName,
  buildGenerationTag,
} from '@/lib/generation-name'

import { StudioOperatorMentionPicker } from './StudioOperatorMentionPicker'

/**
 * `@` 选择器的回归闸（§3.3 第 1 行 / §7）。
 *
 * 钉四件事：
 *  ① **最近生成在前**，素材库在后，且两段按 id 去重 —— 重复行会让上下键走过两个
 *    长得一模一样的选项，用户以为按键没生效；
 *  ② 键盘监听挂在 **window 捕获**上（焦点必须留在输入框里），上下键循环、
 *    回车选中当前高亮的那一条；
 *  ③ 没有候选时**不吞回车** —— 吞了就是「打了 @ 之后再也发不出消息」；
 *  ④ Esc 交给调用方去关（⛔ 组件自己不改草稿）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('motion/react', () => ({
  motion: { div: 'div' },
  useReducedMotion: () => true,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const fetchGalleryImages = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/gallery', () => ({ fetchGalleryImages }))

/** 卡表桩（切片 Y）—— 用例只关心「那一组画出来了、选中交出的是这张卡」。 */
const cardsState = vi.hoisted(() => ({
  current: [{ id: 'card-1', kind: 'character', name: '阿岚', images: [] }] as {
    id: string
    kind: string
    name: string
    images: never[]
  }[],
}))
vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: () => ({ cards: cardsState.current }),
}))

const recent = [
  {
    id: 'g1',
    url: 'https://cdn.test/1.png',
    thumbnailUrl: 'https://cdn.test/1t.png',
    label: '海报 A',
    kind: 'image' as const,
  },
]

beforeEach(() => {
  vi.useFakeTimers()
  fetchGalleryImages.mockResolvedValue({
    success: true,
    data: {
      generations: [
        // ⚠ 与 `recent` 同一条：去重那一半就是靠它验的。
        {
          id: 'g1',
          url: 'https://cdn.test/1.png',
          prompt: '海报 A',
          model: 'x',
          outputType: 'IMAGE',
        },
        {
          id: 'g2',
          url: 'https://cdn.test/2.png',
          prompt: '库里那张',
          model: 'x',
          outputType: 'IMAGE',
        },
      ],
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderPicker(overrides: { query?: string } = {}) {
  const onPick = vi.fn()
  const onDismiss = vi.fn()
  render(
    <StudioOperatorMentionPicker
      searchTypes={['image']}
      query={overrides.query ?? ''}
      recent={recent}
      onPick={onPick}
      onDismiss={onDismiss}
    />,
  )
  // 打字节流那一拍 + 请求的微任务。
  await act(async () => {
    vi.advanceTimersByTime(STUDIO_OPERATOR_MENTION.searchDebounceMs)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { onPick, onDismiss }
}

describe('StudioOperatorMentionPicker · 按产物名搜（切片 N1）', () => {
  it('打 `@图_` 时最近生成按名字过滤 —— 名字就是行上显示的那串字', async () => {
    // ⚠ 号是库里那个真计数器（切片 N1），⛔ 不是从 id 派生的。
    const named = [
      {
        id: 'g1',
        url: 'https://cdn.test/1.png',
        label: buildGenerationDisplayName({ seq: 11, prompt: '海报 A' }),
        kind: 'image' as const,
        seq: 11,
      },
      {
        id: 'g2',
        url: 'https://cdn.test/2.png',
        label: buildGenerationDisplayName({ seq: 12, prompt: '海报 B' }),
        kind: 'image' as const,
        seq: 12,
      },
    ]
    const tag = buildGenerationTag({ seq: 12 })!
    fetchGalleryImages.mockResolvedValue({
      success: true,
      data: { generations: [] },
    })

    render(
      <StudioOperatorMentionPicker
        searchTypes={['image']}
        query={tag}
        recent={named}
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    await act(async () => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_MENTION.searchDebounceMs)
      await Promise.resolve()
      await Promise.resolve()
    })

    const options = screen.getAllByTestId('operator-mention-option')
    expect(options).toHaveLength(1)
    expect(options[0]?.textContent).toContain(tag)
    expect(options[0]?.textContent).toContain('海报 B')
  })
})

describe('StudioOperatorMentionPicker · 搜哪几类', () => {
  it('把 searchTypes 原样交给素材库那一跳（视频档要搜得到片子）', async () => {
    render(
      <StudioOperatorMentionPicker
        searchTypes={['image', 'video']}
        query="渡轮"
        recent={[]}
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    await act(async () => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_MENTION.searchDebounceMs)
      await Promise.resolve()
      await Promise.resolve()
    })
    const options = vi.mocked(fetchGalleryImages).mock.calls.at(-1)?.[2] as {
      type?: string[]
    }
    expect(options.type).toEqual(['image', 'video'])
  })
})

describe('StudioOperatorMentionPicker', () => {
  it('最近生成在前、素材库在后，重复的那条只出现一次', async () => {
    await renderPicker()
    const options = screen.getAllByTestId('operator-mention-option')
    expect(options).toHaveLength(2)
    expect(options[0]?.textContent).toContain('海报 A')
    expect(options[1]?.textContent).toContain('库里那张')
  })

  it('上下键循环、回车选中高亮的那一条（键盘走 window 捕获）', async () => {
    const { onPick } = await renderPicker()
    expect(
      screen.getAllByTestId('operator-mention-option')[0]?.dataset.active,
    ).toBe('true')

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    expect(
      screen.getAllByTestId('operator-mention-option')[1]?.dataset.active,
    ).toBe('true')

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]?.[0]?.id).toBe('g2')
  })

  it('Esc 交给调用方关掉', async () => {
    const { onDismiss } = await renderPicker()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onDismiss).toHaveBeenCalled()
  })

  /**
   * 2026-09-06 真机抓到的 bug 2：Esc 只 `preventDefault()` 不 `stopPropagation()`，
   * 于是同一下按键先被这颗弹层消费、再冒到 Studio 那层全局 Escape 上，表现是
   * 「关掉 @ 选择器时整个助手面板一起收起来」。对照 `StudioOperatorAttachMenu` 的
   * 同名用例。⚠ 事件从 `document` 发（真实按键的 target 是输入框，不是 window）：
   * 直接在 window 上 dispatch 时 window 只出现在「at target」阶段，
   * `stopPropagation` 按规范拦不住同一节点上的其它监听。
   */
  it('消费 Escape 后不再冒泡到 Studio 的全局收起快捷键', async () => {
    const studioEscapeLadder = vi.fn()
    window.addEventListener('keydown', studioEscapeLadder)

    try {
      const { onDismiss } = await renderPicker()
      act(() => {
        fireEvent.keyDown(document, { key: 'Escape' })
      })

      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(studioEscapeLadder).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', studioEscapeLadder)
    }
  })

  it('没有候选时 ⛔ 不吞回车（否则打了 @ 就再也发不出消息）', async () => {
    fetchGalleryImages.mockResolvedValue({
      success: true,
      data: { generations: [] },
    })
    const onPick = vi.fn()
    render(
      <StudioOperatorMentionPicker
        searchTypes={['image']}
        query="找不到的东西"
        recent={[]}
        onPick={onPick}
        onDismiss={vi.fn()}
      />,
    )
    await act(async () => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_MENTION.searchDebounceMs)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('operator-mention-empty')).toBeTruthy()
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
      bubbles: true,
    })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    expect(onPick).not.toHaveBeenCalled()
  })
})

/**
 * 切片 Y —— 被判「已否」的那几张在名单里**看得出来**，但 ⛔ 依然选得中：
 * 摘掉它等于让「这张哪里不行」这句话不可说。
 */
describe('`@` 选择器 · 已否的记号', () => {
  it('已否的那一行打记号，且照旧能选中', () => {
    setOperatorReviewState('g1', GENERATION_REVIEW_STATE_IDS.blocked)
    const onPick = vi.fn()
    render(
      <StudioOperatorMentionPicker
        query=""
        recent={recent}
        searchTypes={['image']}
        onPick={onPick}
        onDismiss={vi.fn()}
      />,
    )
    const option = screen.getAllByTestId('operator-mention-option')[0]!
    expect(option.getAttribute('data-blocked')).toBe('true')
    expect(screen.getAllByTestId('operator-mention-blocked').length).toBe(1)

    fireEvent.mouseDown(option)
    expect(onPick).toHaveBeenCalledWith(recent[0])
    setOperatorReviewState('g1', GENERATION_REVIEW_STATE_IDS.pending)
  })
})

/**
 * 切片 Y —— 「角色卡 / 风格卡」分组。钉两件：宿主接了这只手才画这一组
 * （⛔ 不摆一组点不动的行）、选中交出的是那张卡。
 */
describe('`@` 选择器 · 上下文卡分组', () => {
  it('宿主接了 onPickCard 才画卡组，选中把那张卡交出去', () => {
    const onPickCard = vi.fn()
    render(
      <StudioOperatorMentionPicker
        query=""
        recent={recent}
        searchTypes={['image']}
        onPick={vi.fn()}
        onPickCard={onPickCard}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByTestId('operator-mention-cards')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('context-card-chip'))
    expect(onPickCard).toHaveBeenCalledWith({
      cardId: 'card-1',
      name: '阿岚',
      kind: 'character',
      images: [],
    })
  })

  it('⛔ 宿主不接卡时整组不渲染', () => {
    render(
      <StudioOperatorMentionPicker
        query=""
        recent={recent}
        searchTypes={['image']}
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('operator-mention-cards')).toBeNull()
  })
})
