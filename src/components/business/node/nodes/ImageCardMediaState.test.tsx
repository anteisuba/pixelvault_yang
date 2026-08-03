import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImageCardStatusBadge } from './ImageCardMediaState'

/**
 * 台账 B6（owner 2026-08-03）：关键帧空态卡把同一件事说了两遍 —— 窗内徽标「空」
 * 与 footer「等待关键帧设定」。撤掉泛的那个（徽标），留具体的那个（footer 告诉
 * 你缺的是什么）。
 *
 * 这也与 A7 刚定下的梯度一致：**空 / idle 不盖章，因为空本身看得见** ——
 * 空窗 + 虚线卡边（`canvas-card--dashed`）已经是两层编码。
 */
describe('ImageCardStatusBadge · 空态不盖章', () => {
  it('empty 档整个不渲染', () => {
    const { container } = render(
      <ImageCardStatusBadge variant="empty" label="空" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('其余三档照常渲染', () => {
    for (const variant of ['uploading', 'generating', 'failed'] as const) {
      const { container, unmount } = render(
        <ImageCardStatusBadge variant={variant} label={variant} />,
      )
      expect(container).not.toBeEmptyDOMElement()
      expect(screen.getByText(variant)).toBeInTheDocument()
      unmount()
    }
  })
})
