import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioToolbar } from './StudioToolbar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/studio/StudioEnhanceButton', () => ({
  StudioEnhanceButton: () => <button type="button">assistant</button>,
}))

vi.mock('@/components/business/studio/ReferenceImageChip', () => ({
  ReferenceImageChip: () => <button type="button">image</button>,
}))

vi.mock('@/components/business/studio/StudioCardsButton', () => ({
  StudioCardsButton: () => <button type="button">cards</button>,
}))

vi.mock('@/components/business/studio/StudioAspectRatioPopover', () => ({
  StudioAspectRatioPopover: () => <button type="button">aspect</button>,
}))

vi.mock('@/components/business/studio/StudioResolutionPopover', () => ({
  // Mirrors production behavior: no selected model / capability data in
  // this test, so the real component would render null too.
  StudioResolutionPopover: () => null,
}))

describe('StudioToolbar', () => {
  it('renders the fixed four-chip image toolbar without separators', () => {
    render(<StudioToolbar />)

    expect(screen.getAllByRole('button')).toHaveLength(4)
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['assistant', 'image', 'cards', 'aspect'])
  })
})
