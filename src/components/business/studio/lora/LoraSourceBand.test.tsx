import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoraSourceBand, type LoraSourceBandMode } from './LoraSourceBand'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `LoraSourceBand:${key}`,
}))

function renderBand(props: {
  mode: LoraSourceBandMode
  overlay?: boolean
  dismissible?: boolean
  onExpand?: () => void
  onFold?: () => void
}) {
  return render(
    <div>
      <button type="button">outside</button>
      <LoraSourceBand
        mode={props.mode}
        overlay={props.overlay}
        dismissible={props.dismissible}
        onExpand={props.onExpand ?? vi.fn()}
        onFold={props.onFold ?? vi.fn()}
        canFold
        groups={[{ id: 'a', name: 'Aki', cover: null }]}
        activeGroupId="a"
        onSelectGroup={vi.fn()}
        count={5}
        note="note"
        lineThumbs={[]}
      >
        <div data-testid="band-thumbs">thumbs</div>
      </LoraSourceBand>
    </div>,
  )
}

describe('LoraSourceBand overlay (lora-generate §2.2)', () => {
  it('keeps the full band in flow before any result', () => {
    renderBand({ mode: 'open' })
    expect(
      screen.queryByTestId('lora-source-band-overlay'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('band-thumbs')).toBeInTheDocument()
  })

  it('opens as a floating card over the result and keeps the line in flow', () => {
    renderBand({ mode: 'open', overlay: true })
    const band = screen.getByTestId('lora-source-band')
    expect(band).toHaveAttribute('data-floating', 'true')
    const overlay = screen.getByTestId('lora-source-band-overlay')
    expect(overlay).not.toHaveAttribute('inert')
    expect(overlay).toContainElement(screen.getByTestId('band-thumbs'))
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('folds on outside pointerdown and Escape', () => {
    const onFold = vi.fn()
    renderBand({ mode: 'open', overlay: true, onFold })
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(onFold).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByTestId('band-thumbs'))
    expect(onFold).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFold).toHaveBeenCalledTimes(2)
  })

  it('leaves outside clicks and Escape to the sample viewer while it is open', () => {
    const onFold = vi.fn()
    renderBand({ mode: 'open', overlay: true, dismissible: false, onFold })
    fireEvent.pointerDown(screen.getByText('outside'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onFold).not.toHaveBeenCalled()
  })

  it('the line toggles the floating card', () => {
    const onExpand = vi.fn()
    const onFold = vi.fn()
    const { unmount } = renderBand({
      mode: 'line',
      overlay: true,
      onExpand,
      onFold,
    })
    expect(screen.getByTestId('lora-source-band-overlay')).toHaveAttribute(
      'inert',
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(onExpand).toHaveBeenCalledTimes(1)
    unmount()

    renderBand({ mode: 'open', overlay: true, onExpand, onFold })
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(onFold).toHaveBeenCalledTimes(1)
  })
})
