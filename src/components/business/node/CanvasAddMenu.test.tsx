import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { CanvasAddMenu } from './CanvasAddMenu'

describe('CanvasAddMenu', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    window.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it('keeps manual shot creation inside the image node instead of a standalone shot-text entry', () => {
    render(
      <CanvasAddMenu
        open
        screenPosition={{ x: 24, y: 24 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('nodeTypes.image')).toBeInTheDocument()
    expect(screen.queryByText('nodeTypes.shotText')).not.toBeInTheDocument()
  })
})
