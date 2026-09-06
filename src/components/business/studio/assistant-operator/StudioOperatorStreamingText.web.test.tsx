// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
    const { rerender } = render(
      <StudioOperatorStreamingText text="夜景" streaming />,
    )
    const first = screen.getAllByTestId('operator-message-slice')
    expect(first.map((node) => node.textContent)).toEqual(['夜', '景'])

    rerender(<StudioOperatorStreamingText text="夜景很美" streaming />)
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

  it('定稿之后 data-streaming 落下来', () => {
    const { rerender } = render(
      <StudioOperatorStreamingText text="好" streaming />,
    )
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'true',
    )
    rerender(<StudioOperatorStreamingText text="好的" />)
    expect(screen.getByTestId('operator-message-text').dataset.streaming).toBe(
      'false',
    )
  })

  it('空正文 + 还在流 = 三点占位，高度锁成一行正文高', () => {
    render(<StudioOperatorStreamingText text="" streaming />)
    const pending = screen.getByTestId('operator-message-pending')
    // ⭐ `h-4` = `text-xs`/`leading-relaxed` 的行高：第一个字到达时这一行不许跳。
    expect(pending.className).toContain('h-4')
    expect(pending.className).toContain('text-xs')
    expect(pending.className).toContain('leading-relaxed')
    expect(pending.querySelectorAll('span')).toHaveLength(3)
    for (const dot of pending.querySelectorAll('span')) {
      expect(dot.className).toContain('motion-reduce:animate-none')
    }
  })

  it('⛔ 不在流了就不画占位 —— 空正文那一条不该留一行空脉冲', () => {
    render(<StudioOperatorStreamingText text="" />)
    expect(screen.queryByTestId('operator-message-pending')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe('')
  })
})
