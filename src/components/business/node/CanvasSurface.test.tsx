import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CanvasSurface,
  getCanvasAppearanceCssVars,
  getCanvasCardLineColor,
  getCanvasGridDotColor,
} from './CanvasSurface'

describe('CanvasSurface', () => {
  // S1（2026-07-26）：默认底从旧皮暖炭 #14120F 改成画布域皮肤 v0.2 的 #F1F1F1，
  // 因为白卡靠「比底亮一档」浮起，域默认底必须和 --canvas-bg 同值。
  it('resolves the untouched project to the canvas domain surface', () => {
    render(<CanvasSurface appearance={undefined} />)

    const surface = screen.getByTestId('canvas-surface')
    expect(surface.style.getPropertyValue('--canvas-surface')).toBe('#F1F1F1')
    expect(surface).toHaveClass('pointer-events-none')
    expect(surface).toHaveAttribute('aria-hidden', 'true')
  })

  it('exports stage-level CSS vars for the React Flow Background ancestor', () => {
    const vars = getCanvasAppearanceCssVars({
      backgroundColor: '#ECE7DC',
    }) as Record<string, string>
    expect(vars['--canvas-surface']).toBe('#ECE7DC')
    expect(vars['--canvas-grid-dot']).toBe(getCanvasGridDotColor('#ECE7DC'))
    expect(vars['--canvas-card-line']).toBe(getCanvasCardLineColor('#ECE7DC'))
  })

  // S1 卡边兜底：底色是项目级用户设置（预设含纯白/纯黑 + 自由取色），底与卡背
  // 贴太近时那 1.13:1 的分层会塌成 1.00，卡整个消失——此时必须换强边。
  describe('getCanvasCardLineColor', () => {
    it('keeps the decorative hairline when the surface separates from the card', () => {
      // 域默认底：卡(#FFFFFF) 对底 1.13:1，够读出分层。
      expect(getCanvasCardLineColor('#F1F1F1')).toBe('rgba(0, 0, 0, 0.08)')
      // 深底离白卡更远，同样只需发丝边。
      expect(getCanvasCardLineColor('#14120F')).toBe('rgba(0, 0, 0, 0.08)')
    })

    it('escalates to a readable border when the surface collides with the card', () => {
      // 纯白底：白卡对它 1.00:1，不加重就完全看不见。这是 owner 项目的真实状态。
      expect(getCanvasCardLineColor('#FFFFFF')).toBe('rgba(0, 0, 0, 0.28)')
      // 极浅灰同理，仍在 1.12 阈值之下。
      expect(getCanvasCardLineColor('#FAFAFA')).toBe('rgba(0, 0, 0, 0.28)')
    })

    it('mirrors the rule for the dark scheme, where the card is the lighter side', () => {
      // 深色档卡背 #171717：贴近它的底要强边，远离的用发丝边。
      expect(getCanvasCardLineColor('#171717', true)).toBe(
        'rgba(255, 255, 255, 0.32)',
      )
      expect(getCanvasCardLineColor('#FFFFFF', true)).toBe(
        'rgba(255, 255, 255, 0.10)',
      )
    })

    it('falls back to the hairline when the color cannot be parsed', () => {
      expect(getCanvasCardLineColor('not-a-color')).toBe('rgba(0, 0, 0, 0.08)')
    })
  })

  it('renders a viewport-fixed wallpaper and falls back to color on load error', () => {
    const { container } = render(
      <CanvasSurface
        appearance={{
          backgroundColor: '#ECE7DC',
          image: {
            url: 'https://cdn.example.com/wallpaper.jpg',
            fit: 'contain',
            opacity: 0.42,
          },
        }}
      />,
    )

    const image = container.querySelector('img')
    expect(image).toHaveClass('object-contain')
    expect(image).toHaveStyle({ opacity: '0.42' })

    fireEvent.error(image as HTMLImageElement)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId('canvas-surface')
        .style.getPropertyValue('--canvas-surface'),
    ).toBe('#ECE7DC')
  })

  it('chooses a contrasting low-emphasis grid color', () => {
    expect(getCanvasGridDotColor('#F4EFE4')).toBe('rgba(20, 18, 15, 0.2)')
    expect(getCanvasGridDotColor('#14120F')).toBe('rgba(235, 229, 216, 0.18)')
  })
})
