import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoraCoverPreviewDialog } from './LoraCoverPreviewDialog'
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function setup() {
  const onClose = vi.fn()
  render(
    <LoraCoverPreviewDialog
      preview={{ url: '/first.png', name: 'Preview' }}
      images={['/first.png', '/second.png', '/third.png']}
      onClose={onClose}
    />,
  )
  return onClose
}
describe('LoRA cover preview', () => {
  it('navigates with arrows and keyboard, without closing on image clicks', () => {
    const close = setup()
    fireEvent.click(screen.getByRole('button', { name: 'coverPreviewNext' }))
    expect(screen.getByRole('img').getAttribute('src')).toBe('/second.png')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(screen.getByRole('img').getAttribute('src')).toBe('/third.png')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect(screen.getByRole('img').getAttribute('src')).toBe('/second.png')
    fireEvent.click(screen.getByRole('img'))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(close).toHaveBeenCalledOnce()
  })
  it('swipes both ways while ignoring vertical gestures', () => {
    setup()
    const img = screen.getByRole('img')
    fireEvent.touchStart(img, {
      touches: [{ clientX: 200, clientY: 100 }],
      changedTouches: [{ clientX: 200, clientY: 100 }],
    })
    fireEvent.touchEnd(img, { changedTouches: [{ clientX: 80, clientY: 110 }] })
    expect(img.getAttribute('src')).toBe('/second.png')
    fireEvent.touchStart(img, {
      touches: [{ clientX: 80, clientY: 100 }],
      changedTouches: [{ clientX: 80, clientY: 100 }],
    })
    fireEvent.touchEnd(img, {
      changedTouches: [{ clientX: 200, clientY: 110 }],
    })
    expect(img.getAttribute('src')).toBe('/first.png')
    fireEvent.touchStart(img, {
      touches: [{ clientX: 200, clientY: 100 }],
      changedTouches: [{ clientX: 200, clientY: 100 }],
    })
    fireEvent.touchEnd(img, {
      changedTouches: [{ clientX: 100, clientY: 300 }],
    })
    expect(img.getAttribute('src')).toBe('/first.png')
  })
})
