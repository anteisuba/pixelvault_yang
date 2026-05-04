import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioAudioParams } from './StudioAudioParams'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderAudioParams(overrides?: {
  onChangeEmotion?: (emotion: string) => void
  onChangePace?: (pace: string) => void
  onChangePauseMarkers?: (markers: string[]) => void
}) {
  const props = {
    voiceCardId: 'voice-card-1',
    emotion: 'neutral',
    pace: 'normal',
    pauseMarkers: [],
    onChangeEmotion: overrides?.onChangeEmotion ?? vi.fn(),
    onChangePace: overrides?.onChangePace ?? vi.fn(),
    onChangePauseMarkers: overrides?.onChangePauseMarkers ?? vi.fn(),
  }

  render(<StudioAudioParams {...props} />)
  return props
}

describe('StudioAudioParams', () => {
  it('renders emotion and pace controls', () => {
    renderAudioParams()

    expect(screen.getByText('emotionNeutral')).toBeInTheDocument()
    expect(screen.getByText('emotionHappy')).toBeInTheDocument()
    expect(screen.getByText('paceSlow')).toBeInTheDocument()
    expect(screen.getByText('paceNormal')).toBeInTheDocument()
    expect(screen.getByText('paceFast')).toBeInTheDocument()
  })

  it('calls onChangeEmotion when selecting an emotion', () => {
    const onChangeEmotion = vi.fn()
    renderAudioParams({ onChangeEmotion })

    fireEvent.click(screen.getByText('emotionHappy'))

    expect(onChangeEmotion).toHaveBeenCalledWith('happy')
  })

  it('calls onChangePace when selecting pace', () => {
    const onChangePace = vi.fn()
    renderAudioParams({ onChangePace })

    fireEvent.click(screen.getByText('paceFast'))

    expect(onChangePace).toHaveBeenCalledWith('fast')
  })
})
