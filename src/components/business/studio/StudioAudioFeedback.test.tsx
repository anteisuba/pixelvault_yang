import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioAudioFeedback } from './StudioAudioFeedback'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StudioAudioFeedback', () => {
  it('renders audio feedback chips', () => {
    render(<StudioAudioFeedback generationId="gen-1" onFeedback={vi.fn()} />)

    expect(screen.getByText('voiceMismatch')).toBeInTheDocument()
    expect(screen.getByText('emotionWrong')).toBeInTheDocument()
    expect(screen.getByText('paceWrong')).toBeInTheDocument()
    expect(screen.getByText('pronunciationError')).toBeInTheDocument()
    expect(screen.getByText('pauseUnnatural')).toBeInTheDocument()
    expect(screen.getByText('audioQuality')).toBeInTheDocument()
  })

  it('calls onFeedback with selected tags', () => {
    const onFeedback = vi.fn()
    render(<StudioAudioFeedback generationId="gen-1" onFeedback={onFeedback} />)

    fireEvent.click(screen.getByText('voiceMismatch'))

    expect(onFeedback).toHaveBeenCalledWith(['voice_mismatch'])
    expect(screen.getByText('voiceMismatch')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('supports multiple selected feedback tags', () => {
    const onFeedback = vi.fn()
    render(<StudioAudioFeedback generationId="gen-1" onFeedback={onFeedback} />)

    fireEvent.click(screen.getByText('voiceMismatch'))
    fireEvent.click(screen.getByText('paceWrong'))

    expect(onFeedback).toHaveBeenLastCalledWith([
      'voice_mismatch',
      'pace_wrong',
    ])
  })
})
