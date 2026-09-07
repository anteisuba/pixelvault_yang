// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'

import {
  StudioOperatorStreamingText,
  sliceStreamingText,
} from './StudioOperatorStreamingText'

/**
 * 正文流式渲染件的回归闸（§4.1 / §11.5）。
 *
 * 钉四件事：
 *  ① 中日韩**逐字**、拉丁**逐词**切片 —— 中文按空白切等于整段一片，
 *     而整段一片就没有「一个字一个字」可言（owner 要的正是那件事）；
 *  ② 老片段**不重挂** —— 淡入靠挂载动画，重挂的表现是整段文字每来一个字闪一下；
 *  ③ 空正文 + 还在流 = 占位脉冲，**高度就是一行正文高**（§4.1「骨架尺寸=内容尺寸」）；
 *  ④ 每一片都带 `motion-reduce:animate-none` —— 淡入是装饰，⛔ 不许成为看不看得见字的条件。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * `motion-reduce` 那一档由这颗桩控制：⛔ 别去动 `matchMedia` ——
 * `useReducedMotion` 在挂载后才订阅，jsdom 里那一跳的时序会让用例时绿时红。
 */
const reducedMotion = vi.hoisted(() => ({ value: false }))
vi.mock('motion/react', () => ({
  useReducedMotion: () => reducedMotion.value,
}))

afterEach(() => {
  reducedMotion.value = false
  vi.useRealTimers()
})

/** 揭示速率的一跳（`revealCharsPerSec` = 每跳一个字）。 */
const TICK_MS = 1000 / STUDIO_OPERATOR_STREAMING.revealCharsPerSec

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function slices(): string[] {
  return screen
    .getAllByTestId('operator-message-slice')
    .map((node) => node.textContent ?? '')
}

describe('sliceStreamingText', () => {
  it('中日韩逐字、拉丁逐词，空白单独成片且原样保留', () => {
    expect(sliceStreamingText('夜景')).toEqual(['夜', '景'])
    expect(sliceStreamingText('night city')).toEqual(['night', ' ', 'city'])
    expect(sliceStreamingText('已改成 night')).toEqual([
      '已',
      '改',
      '成',
      ' ',
      'night',
    ])
    // 换行是内容的一部分（`whitespace-pre-wrap` 靠它排版）。
    expect(sliceStreamingText('a\nb').join('')).toBe('a\nb')
  })

  it('空串不产片 —— 占位那一支靠这个判', () => {
    expect(sliceStreamingText('')).toEqual([])
  })
})

describe('StudioOperatorStreamingText', () => {
  it('长出来的字只追加新片段，老片段是同一个节点（⛔ 不重挂）', () => {
    vi.useFakeTimers()
    // ⚠ 挂载时就有的那几个字**不揭示**（历史条目开屏不该重放一遍）。
    const { rerender } = render(
      <StudioOperatorStreamingText text="夜景" streaming />,
    )
    const first = screen.getAllByTestId('operator-message-slice')
    expect(first.map((node) => node.textContent)).toEqual(['夜', '景'])

    rerender(<StudioOperatorStreamingText text="夜景很美" streaming />)
    advance(TICK_MS * 2)
    const next = screen.getAllByTestId('operator-message-slice')
    expect(next.map((node) => node.textContent)).toEqual([
      '夜',
      '景',
      '很',
      '美',
    ])
    // ⭐ 同一个 DOM 节点 —— 重挂就会重新淡一次，整段跟着闪。
    expect(next[0]).toBe(first[0])
    expect(next[1]).toBe(first[1])
  })

  it('每一片都带 motion-reduce 降级', () => {
    render(<StudioOperatorStreamingText text="夜景" />)
    for (const slice of screen.getAllByTestId('operator-message-slice')) {
      expect(slice.className).toContain('motion-reduce:animate-none')
      expect(slice.className).toContain('duration-(--duration-fast)')
    }
  })

  it('定稿之后 data-streaming 落下来 —— ⚠ 等揭示走完才落', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <StudioOperatorStreamingText text="好" streaming />,
    )
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'true',
    )
    rerender(<StudioOperatorStreamingText text="好的" />)
    // ⭐ 定稿帧到了但那个「的」还没写出来 —— 这一刻**仍然算在流**，
    //    折叠 / 自动收起因此不会在字长到一半时动手。
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'true',
    )
    advance(TICK_MS * 2)
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'false',
    )
  })

  it('空正文 + 还在流 = 三点占位，高度锁成一行正文高', () => {
    render(<StudioOperatorStreamingText text="" streaming />)
    const pending = screen.getByTestId('operator-message-pending')
    // ⭐ `h-6` = `text-md`/`leading-relaxed` 的行高：第一个字到达时这一行不许跳。
    expect(pending.className).toContain('h-6')
    expect(pending.className).toContain('text-md')
    expect(pending.className).toContain('leading-relaxed')
    expect(pending.querySelectorAll('span')).toHaveLength(3)
    for (const dot of pending.querySelectorAll('span')) {
      expect(dot.className).toContain('motion-reduce:animate-none')
    }
  })

  /**
   * ⭐ **定稿之后的打字机**（owner 2026-09-07「助手回复应该一个字一个字连续出」）。
   *
   * 🔬 由来：provider 那一侧的分块粗到 4 块 / 130ms —— 落地闸只能保证「块到了就
   * 写进去」，写进去的仍然是一整块。所以揭示由渲染侧按速率自己走。
   */
  describe('定稿后的逐字揭示', () => {
    it('按 revealCharsPerSec 递增，⛔ 不一次全量落地', () => {
      vi.useFakeTimers()
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(
        <StudioOperatorStreamingText text="已经改成夜景了" streaming={false} />,
      )
      // 定稿那一刻屏幕上还是空的（一个字都还没揭示，⛔ 不是整段砸出来）。
      expect(screen.getByTestId('operator-message-text').textContent).toBe('')
      advance(TICK_MS * 3)
      expect(slices().join('')).toBe('已经改')
      advance(TICK_MS * 2)
      expect(slices().join('')).toBe('已经改成夜')
      advance(TICK_MS * 2)
      expect(slices().join('')).toBe('已经改成夜景了')
    })

    /**
     * 🔬 2026-09-07 真机：标签页不在最前时浏览器把定时器夹到 1 秒一跳 ——
     * 「每跳一个字」于是变成「每秒一个字」，88 字要写 40 秒。揭示因此读的是
     * **墙上时钟**：跳得多慢都只影响平滑度，总时长不变。
     */
    it('⭐ 定时器被夹到 1 秒一跳也照样按时收完（⛔ 不是每跳一个字）', () => {
      vi.useFakeTimers()
      const long = '字'.repeat(120)
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(<StudioOperatorStreamingText text={long} streaming={false} />)
      // 120 字按 60 字/秒 = 2000ms，封顶到 revealMaxMs=1500ms；只跳两次也得写完。
      advance(1000)
      expect(slices().join('').length).toBeGreaterThan(50)
      advance(1000)
      expect(slices().join('').length).toBe(long.length)
    })

    /**
     * 🔬 2026-09-07 真机：标签页在后台时 Chrome 把连续定时器夹到一分钟一跳，
     * 表现是切回来那一眼正文停在半句上。没人在看的时候不演，直接把字给全。
     */
    it('⭐ 标签页在后台 → 直接落地，⛔ 不留半句在屏幕上', () => {
      vi.useFakeTimers()
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(
        <StudioOperatorStreamingText text="已经改成夜景了" streaming={false} />,
      )
      advance(1)
      expect(slices().join('')).toBe('已经改成夜景了')
      hidden.mockRestore()
    })

    it('⭐ 长回复由 revealMaxMs 封顶 —— 提速率收完，⛔ 不是让人等 8 秒', () => {
      vi.useFakeTimers()
      const long = '字'.repeat(500)
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(<StudioOperatorStreamingText text={long} streaming={false} />)

      // 按 60 字/秒要 8.3 秒；封顶那一档必须在 revealMaxMs 之内收完。
      advance(STUDIO_OPERATOR_STREAMING.revealMaxMs + TICK_MS)
      expect(slices().join('').length).toBe(long.length)
    })

    it('点一下正文就立刻收完剩下的字', () => {
      vi.useFakeTimers()
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(
        <StudioOperatorStreamingText text="已经改成夜景了" streaming={false} />,
      )
      advance(TICK_MS * 2)
      expect(slices().join('')).toBe('已经')

      act(() => {
        screen.getByTestId('operator-message-text').click()
      })
      expect(slices().join('')).toBe('已经改成夜景了')
    })

    it('⭐ motion-reduce 直接落地 —— ⛔ 打字机不许成为读到这句话的条件', () => {
      reducedMotion.value = true
      vi.useFakeTimers()
      const { rerender } = render(
        <StudioOperatorStreamingText text="" streaming />,
      )
      rerender(
        <StudioOperatorStreamingText text="已经改成夜景了" streaming={false} />,
      )
      expect(slices().join('')).toBe('已经改成夜景了')
      expect(
        screen.getByTestId('operator-message-text').dataset.streaming,
      ).toBe('false')
    })

    it('揭示期间向上报 revealing，收完再报一次 false', () => {
      vi.useFakeTimers()
      const onRevealingChange = vi.fn()
      const { rerender } = render(
        <StudioOperatorStreamingText
          text=""
          streaming
          onRevealingChange={onRevealingChange}
        />,
      )
      rerender(
        <StudioOperatorStreamingText
          text="夜景"
          streaming={false}
          onRevealingChange={onRevealingChange}
        />,
      )
      expect(onRevealingChange).toHaveBeenLastCalledWith(true)
      advance(TICK_MS * 2)
      expect(onRevealingChange).toHaveBeenLastCalledWith(false)
    })
  })

  it('⛔ 不在流了就不画占位 —— 空正文那一条不该留一行空脉冲', () => {
    render(<StudioOperatorStreamingText text="" />)
    expect(screen.queryByTestId('operator-message-pending')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe('')
  })
})
