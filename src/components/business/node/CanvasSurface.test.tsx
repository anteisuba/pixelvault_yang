import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CanvasSurface,
  getCanvasAppearanceCssVars,
  getCanvasGridDotColor,
} from './CanvasSurface'

describe('CanvasSurface', () => {
  it('resolves the untouched project to the warm charcoal surface', () => {
    render(<CanvasSurface appearance={undefined} />)

    const surface = screen.getByTestId('canvas-surface')
    expect(surface.style.getPropertyValue('--canvas-surface')).toBe('#14120F')
    expect(surface).toHaveClass('pointer-events-none')
    expect(surface).toHaveAttribute('aria-hidden', 'true')
  })

  it('exports stage-level CSS vars for the React Flow Background ancestor', () => {
    const vars = getCanvasAppearanceCssVars({
      backgroundColor: '#ECE7DC',
    }) as Record<string, string>
    expect(vars['--canvas-surface']).toBe('#ECE7DC')
    expect(vars['--canvas-grid-dot']).toBe(getCanvasGridDotColor('#ECE7DC'))
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
