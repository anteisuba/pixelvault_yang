import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioKeepChangePanel } from './StudioKeepChangePanel'
import type { ImageIntent } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const MOCK_INTENT: ImageIntent = {
  subject: 'cat',
}

function renderPanel(onSubmit = vi.fn()) {
  return {
    onSubmit,
    ...render(
      <StudioKeepChangePanel
        open
        onOpenChange={vi.fn()}
        currentIntent={MOCK_INTENT}
        onSubmit={onSubmit}
      />,
    ),
  }
}

describe('StudioKeepChangePanel', () => {
  it('renders keep and change chips', () => {
    renderPanel()

    expect(screen.getByText('keepSection')).toBeInTheDocument()
    expect(screen.getByText('changeSection')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'subject' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'style' })).toHaveLength(2)
  })

  it('prevents selecting the same tag for keep and change', () => {
    renderPanel()

    const subjectButtons = screen.getAllByRole('button', { name: 'subject' })
    fireEvent.click(subjectButtons[0])

    expect(subjectButtons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(subjectButtons[1]).toBeDisabled()
  })

  it('submits selected keep/change tags and free text', () => {
    const onSubmit = vi.fn()
    renderPanel(onSubmit)

    fireEvent.click(screen.getAllByRole('button', { name: 'subject' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'style' })[1])
    fireEvent.change(screen.getByLabelText('freeText'), {
      target: { value: 'make the background brighter' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'submit' }))

    expect(onSubmit).toHaveBeenCalledWith(
      ['subject'],
      ['style'],
      'make the background brighter',
    )
  })
})
