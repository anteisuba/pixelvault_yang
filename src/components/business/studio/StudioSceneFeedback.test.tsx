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
})
