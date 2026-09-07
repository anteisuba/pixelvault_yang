import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KIND_IDS,
} from '@/constants/context-cards'

/**
 * 上下文卡 chip（K1）的回归闸，两条：
 *  ① **脸取设定图** —— 设定图是这张卡的身份证据；用一张随手挂的气氛参考当脸，
 *    是把「这是谁」讲错了。
 *  ② **与素材 chip 同尺寸** —— 它就住在同一排里，另发明一个高度会让那排参差不齐。
 */

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as { src: string; alt: string })} />
  ),
}))

import { ContextCardChip, pickContextCardFace } from './ContextCardChip'

const SHEET = {
  url: 'https://cdn.test/sheet.png',
  role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
  sourceRef: null,
}
const MOOD = {
  url: 'https://cdn.test/mood.png',
  role: CONTEXT_CARD_IMAGE_ROLE_IDS.reference,
  sourceRef: null,
}

describe('pickContextCardFace', () => {
  it('设定图优先于随手挂的参考图', () => {
    expect(pickContextCardFace([MOOD, SHEET])).toBe(SHEET)
  })

  it('没有设定图时退回第一张', () => {
    expect(pickContextCardFace([MOOD])).toBe(MOOD)
  })

  it('一张图都没有时是 null（由首字母顶上）', () => {
    expect(pickContextCardFace([])).toBeNull()
  })
})

describe('ContextCardChip', () => {
  it('有图时画设定图，没图时画首字母', () => {
    // ⚠ 脸那张图是**装饰性**的（`alt=""`，名字就在旁边），所以按标签取而不是
    //   按 role —— 给它编一句 alt 才是无障碍上的噪音。
    const { container, rerender } = render(
      <ContextCardChip
        cardId="card-1"
        name="Sigrika"
        kind={CONTEXT_CARD_KIND_IDS.character}
        images={[MOOD, SHEET]}
      />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', SHEET.url)

    rerender(
      <ContextCardChip
        cardId="card-1"
        name="西格莉卡"
        kind={CONTEXT_CARD_KIND_IDS.character}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('西')).toBeInTheDocument()
  })

  it('与素材 chip 同一颗触发件的尺寸类，且不带状态色', () => {
    render(
      <ContextCardChip
        cardId="card-1"
        name="Sigrika"
        kind={CONTEXT_CARD_KIND_IDS.character}
      />,
    )
    const chip = screen.getByTestId('context-card-chip')
    expect(chip.className).toContain('h-11')
    expect(chip.className).toContain('sm:h-9')
    for (const statusToken of ['destructive', 'warning', 'success']) {
      expect(chip.className).not.toContain(statusToken)
    }
  })

  it('点它带上卡 id；摘除钮不冒泡成一次选中', () => {
    const onSelect = vi.fn()
    const onRemove = vi.fn()
    render(
      <ContextCardChip
        cardId="card-9"
        name="Sigrika"
        kind={CONTEXT_CARD_KIND_IDS.character}
        onSelect={onSelect}
        onRemove={onRemove}
        removeLabel="remove"
      />,
    )

    fireEvent.click(screen.getByTestId('context-card-chip'))
    expect(onSelect).toHaveBeenCalledWith('card-9')

    fireEvent.click(screen.getByLabelText('remove'))
    expect(onRemove).toHaveBeenCalledWith('card-9')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
