import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioSceneFeedback } from './StudioSceneFeedback'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StudioSceneFeedback', () => {
  it('renders five scene action buttons', () => {
    render(<StudioSceneFeedback sceneIndex={0} onAction={vi.fn()} />)

    expect(screen.getByText('keepCharacter')).toBeInTheDocument()
    expect(screen.getByText('keepStyle')).toBeInTheDocument()
    expect(screen.getByText('keepContinuity')).toBeInTheDocument()
    expect(screen.getByText('extendScene')).toBeInTheDocument()
    expect(screen.getByText('continueFromLastFrame')).toBeInTheDocument()
  })

  it('calls onAction when clicking a button', () => {
    const onAction = vi.fn()
    render(<StudioSceneFeedback sceneIndex={1} onAction={onAction} />)

    fireEvent.click(screen.getByText('keepCharacter'))

    expect(onAction).toHaveBeenCalledWith('keep_character')
  })

  it('passes the correct continue action value', () => {
    const onAction = vi.fn()
    render(<StudioSceneFeedback sceneIndex={1} onAction={onAction} />)

    fireEvent.click(screen.getByText('continueFromLastFrame'))

    expect(onAction).toHaveBeenCalledWith('continue_from_last_frame')
  })

  it('disables coming soon actions', () => {
    const onAction = vi.fn()
    render(
      <StudioSceneFeedback
        sceneIndex={1}
        onAction={onAction}
        disabledActions={['extend_scene', 'continue_from_last_frame']}
      />,
    )

    const extendButton = screen.getByRole('button', { name: 'extendScene' })
    const continueButton = screen.getByRole('button', {
      name: 'continueFromLastFrame',
    })

    expect(extendButton).toBeDisabled()
    expect(extendButton).toHaveAttribute('title', 'comingSoon')
    expect(continueButton).toBeDisabled()

    fireEvent.click(extendButton)

    expect(onAction).not.toHaveBeenCalled()
  })
})
