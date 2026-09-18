import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { StudioReferenceRail } from './StudioReferenceRail'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const entries: ReferenceImageEntry[] = [
  { url: '/one.png', disabledReason: null },
  { url: '/two.png', disabledReason: 'unsupported' },
  { url: '/three.png', disabledReason: 'over_limit' },
]

function ReferenceRail() {
  const [index, setIndex] = useState(0)
  return (
    <StudioReferenceRail
      label="References"
      entries={entries}
      activeIndex={index}
      onActiveIndexChange={setIndex}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
    />
  )
}

describe('StudioReferenceRail keyboard and unavailable references', () => {
  it('has one Tab stop and wraps arrow navigation, including unavailable entries', () => {
    render(<ReferenceRail />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0])
    expect(screen.getByRole('status')).toHaveTextContent('disabledOverLimit')
    expect(tabs[2]).toHaveAccessibleDescription('disabledOverLimit')
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
    expect(tabs[0]).toHaveFocus()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('supports Home/End and exposes the reason after a click without hovering', () => {
    render(<ReferenceRail />)
    const tabs = screen.getAllByRole('tab')
    fireEvent.click(tabs[1])
    expect(screen.getByRole('status')).toHaveTextContent('disabledUnsupported')
    expect(tabs[1]).toHaveAccessibleDescription('disabledUnsupported')
    fireEvent.keyDown(tabs[1], { key: 'End' })
    expect(tabs[2]).toHaveFocus()
    fireEvent.keyDown(tabs[2], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
    expect(screen.queryByText('disabledUnsupported')).not.toBeInTheDocument()
  })
})
