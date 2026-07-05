import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}))

import {
  ReferenceTokenChip,
  type ReferenceTokenData,
} from './ReferenceTokenChip'

function baseToken(
  overrides: Partial<ReferenceTokenData> = {},
): ReferenceTokenData {
  return {
    id: 'c1',
    kind: 'character',
    label: '角色A',
    token: '@角色A',
    ...overrides,
  }
}

describe('ReferenceTokenChip', () => {
  it('renders a non-insertable indicator for an unnamed reference', () => {
    render(
      <ReferenceTokenChip
        data={baseToken({ label: '', token: '' })}
        onInsert={vi.fn()}
      />,
    )
    expect(
      screen.getByText('references.unnamed', { exact: false }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the media thumbnail when the reference has an image', () => {
    render(
      <ReferenceTokenChip
        data={baseToken({ mediaUrl: 'https://cdn.test/a.png' })}
        onInsert={vi.fn()}
      />,
    )
    const img = screen
      .getByRole('button', { name: '@角色A' })
      .querySelector('img')
    expect(img).toHaveAttribute('src', 'https://cdn.test/a.png')
  })

  it('falls back to the name initial when a visual reference has no image yet', () => {
    render(<ReferenceTokenChip data={baseToken()} onInsert={vi.fn()} />)
    const chip = screen.getByRole('button', { name: '@角色A' })
    expect(chip.querySelector('img')).toBeNull()
    expect(chip).toHaveTextContent('角')
  })

  it('falls back to a Mic icon (not the name initial) for a voice reference with no cover', () => {
    render(
      <ReferenceTokenChip
        data={baseToken({ kind: 'voice', token: '@Audio1' })}
        onInsert={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: '角色A' })
    expect(chip.querySelector('img')).toBeNull()
    expect(chip.querySelector('svg')).toBeInTheDocument()
  })

  it('renders a square shape for background/shot and a circle for character/voice', () => {
    const { rerender } = render(
      <ReferenceTokenChip
        data={baseToken({ kind: 'background' })}
        onInsert={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '@角色A' }).className).toContain(
      'rounded-md',
    )

    rerender(
      <ReferenceTokenChip
        data={baseToken({ kind: 'character' })}
        onInsert={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '@角色A' }).className).toContain(
      'rounded-full',
    )
  })

  it('calls onInsert with the token data and the clicked element', () => {
    const onInsert = vi.fn()
    render(<ReferenceTokenChip data={baseToken()} onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: '@角色A' }))
    expect(onInsert).toHaveBeenCalledTimes(1)
    const [calledData, calledEl] = onInsert.mock.calls[0]
    expect(calledData).toEqual(baseToken())
    expect(calledEl).toBeInstanceOf(HTMLElement)
  })

  it('reveals the hover preview with a locate action', () => {
    const onLocate = vi.fn()
    render(
      <ReferenceTokenChip
        data={baseToken()}
        onInsert={vi.fn()}
        onLocate={onLocate}
      />,
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: '@角色A' }))
    expect(screen.getByText('references.locate')).toBeInTheDocument()
    fireEvent.click(screen.getByText('references.locate'))
    expect(onLocate).toHaveBeenCalledWith('c1')
  })

  it('renders a video reference as a projection-only slot (never inserts)', () => {
    const onInsert = vi.fn()
    render(
      <ReferenceTokenChip
        data={baseToken({
          kind: 'video',
          label: '',
          token: '',
          insertable: false,
          mediaUrl: 'https://cdn.test/clip-thumb.webp',
        })}
        onInsert={onInsert}
      />,
    )
    // Slot visual (not the "needs a name" pill), auto-send hint as title.
    const slot = screen.getByRole('button', { name: 'refKind.video' })
    expect(slot).toHaveAttribute('title', 'references.videoAutoHint')
    fireEvent.click(slot)
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('renders an unready voice dimmed with a not-sent warning', () => {
    const onInsert = vi.fn()
    render(
      <ReferenceTokenChip
        data={baseToken({
          kind: 'voice',
          label: '卡提希娅',
          token: '',
          insertable: false,
          dimmed: true,
        })}
        onInsert={onInsert}
      />,
    )
    const slot = screen.getByRole('button', { name: '卡提希娅' })
    expect(slot.className).toContain('opacity-40')
    expect(slot).toHaveAttribute('title', 'references.voiceNotReadyHint')
    fireEvent.click(slot)
    expect(onInsert).not.toHaveBeenCalled()
    // The hover preview repeats the warning so it's never silent.
    fireEvent.mouseEnter(slot)
    expect(
      screen.getAllByText('references.voiceNotReadyHint').length,
    ).toBeGreaterThan(0)
  })
})
