import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StudioAudioParams,
  type StudioAudioAdvancedSettings,
} from './StudioAudioParams'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

function renderAudioParams(overrides?: {
  onChangePace?: (pace: string) => void
  onChangePauseMarkers?: (markers: string[]) => void
  onChangeAdvanced?: (settings: Partial<StudioAudioAdvancedSettings>) => void
}) {
  const advanced: StudioAudioAdvancedSettings = {
    style: 'none',
    volume: 0,
    normalizeLoudness: true,
    normalizeText: true,
    withTimestamps: false,
    format: 'mp3',
    sampleRate: 44100,
    mp3Bitrate: 128,
    opusBitrate: 32000,
    latency: 'normal',
    temperature: 0.7,
    topP: 0.7,
    chunkLength: 300,
    repetitionPenalty: 1.2,
    speakerVoiceIds: [],
  }
  const props = {
    voiceCardId: 'voice-card-1',
    pace: 'normal',
    pauseMarkers: [],
    advanced,
    onChangePace: overrides?.onChangePace ?? vi.fn(),
    onChangePauseMarkers: overrides?.onChangePauseMarkers ?? vi.fn(),
    onChangeAdvanced: overrides?.onChangeAdvanced ?? vi.fn(),
  }

  render(<StudioAudioParams {...props} />)
  return props
}

describe('StudioAudioParams', () => {
  it('renders pace and pause controls with hints', () => {
    renderAudioParams()

    expect(screen.getByText('paceSlow')).toBeInTheDocument()
    expect(screen.getByText('paceNormal')).toBeInTheDocument()
    expect(screen.getByText('paceFast')).toBeInTheDocument()
    expect(screen.getByText('styleNarration')).toBeInTheDocument()
    expect(screen.getByText('advancedHint')).toBeInTheDocument()
    expect(screen.getByText('paceHint')).toBeInTheDocument()
    expect(screen.getByText('pauseMarkersHint')).toBeInTheDocument()
  })

  it('calls onChangePace when selecting pace', () => {
    const onChangePace = vi.fn()
    renderAudioParams({ onChangePace })

    fireEvent.click(screen.getByText('paceFast'))

    expect(onChangePace).toHaveBeenCalledWith('fast')
  })

  it('calls onChangeAdvanced when selecting a reading style', () => {
    const onChangeAdvanced = vi.fn()
    renderAudioParams({ onChangeAdvanced })

    fireEvent.click(screen.getByText('styleNarration'))

    expect(onChangeAdvanced).toHaveBeenCalledWith({ style: 'narration' })
  })

  it('groups advanced controls into output, voice, and model tabs', () => {
    renderAudioParams()

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))

    expect(screen.getByText('tabOutput')).toBeInTheDocument()
    expect(screen.getByText('tabVoice')).toBeInTheDocument()
    expect(screen.getByText('tabModel')).toBeInTheDocument()
    expect(screen.getByText('format')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))
    expect(screen.getByText('speakerVoiceIds')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /tabModel/ }))
    expect(screen.getByText('temperature')).toBeInTheDocument()
    expect(screen.getByText('withTimestamps')).toBeInTheDocument()
  })
})
