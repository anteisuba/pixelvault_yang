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
  advanced?: Partial<StudioAudioAdvancedSettings>
  activeSpeakerVoiceIndex?: number | null
  expressiveness?: string
  onChangePace?: (pace: string) => void
  onChangeExpressiveness?: (value: string) => void
  onChangePauseMarkers?: (markers: string[]) => void
  onChangeAdvanced?: (settings: Partial<StudioAudioAdvancedSettings>) => void
  onRequestSpeakerVoiceSelect?: (index: number | null) => void
  audioReferenceUrl?: string | null
  audioReferenceFileName?: string | null
  audioReferenceText?: string
  onChangeAudioReferenceUpload?: (
    payload: { url: string; fileName: string } | null,
  ) => void
  onChangeAudioReferenceText?: (text: string) => void
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
    ...overrides?.advanced,
  }
  const props = {
    voiceCardId: 'voice-card-1',
    pace: 'normal',
    expressiveness: overrides?.expressiveness ?? 'auto',
    pauseMarkers: [],
    advanced,
    onChangePace: overrides?.onChangePace ?? vi.fn(),
    onChangeExpressiveness: overrides?.onChangeExpressiveness ?? vi.fn(),
    onChangePauseMarkers: overrides?.onChangePauseMarkers ?? vi.fn(),
    onChangeAdvanced: overrides?.onChangeAdvanced ?? vi.fn(),
    onRequestSpeakerVoiceSelect:
      overrides?.onRequestSpeakerVoiceSelect ?? vi.fn(),
    activeSpeakerVoiceIndex: overrides?.activeSpeakerVoiceIndex,
    audioReferenceUrl: overrides?.audioReferenceUrl ?? null,
    audioReferenceFileName: overrides?.audioReferenceFileName ?? null,
    audioReferenceText: overrides?.audioReferenceText ?? '',
    onChangeAudioReferenceUpload:
      overrides?.onChangeAudioReferenceUpload ?? vi.fn(),
    onChangeAudioReferenceText:
      overrides?.onChangeAudioReferenceText ?? vi.fn(),
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

  it('renders speaker voice ids as chips with picker and remove controls', () => {
    const onChangeAdvanced = vi.fn()
    const onRequestSpeakerVoiceSelect = vi.fn()
    renderAudioParams({
      advanced: {
        speakerVoiceIds: ['voice-a', 'voice-b'],
      },
      activeSpeakerVoiceIndex: 1,
      onChangeAdvanced,
      onRequestSpeakerVoiceSelect,
    })

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    expect(screen.getByText('voice-a')).toBeInTheDocument()
    expect(screen.getByText('voice-b')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'speakerVoiceAdd' }))
    expect(onRequestSpeakerVoiceSelect).toHaveBeenCalledWith(null)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'speakerVoiceReplace' })[1],
    )
    expect(onRequestSpeakerVoiceSelect).toHaveBeenCalledWith(1)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'speakerVoiceRemove' })[0],
    )
    expect(onChangeAdvanced).toHaveBeenCalledWith({
      speakerVoiceIds: ['voice-b'],
    })
  })

  it('converts pasted speaker ids into chips instead of keeping a comma string', () => {
    const onChangeAdvanced = vi.fn()
    renderAudioParams({ onChangeAdvanced })

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    const input = screen.getByPlaceholderText('speakerVoiceInputPlaceholder')
    fireEvent.change(input, { target: { value: 'voice-a, voice-b' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChangeAdvanced).toHaveBeenCalledWith({
      speakerVoiceIds: ['voice-a', 'voice-b'],
    })
  })

  it('renders the reference-audio dropzone with transcript field on the Voice tab', () => {
    renderAudioParams()

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    // Empty state: dropzone visible, transcript empty
    expect(screen.getByText(/referencePick/)).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('referenceTextPlaceholder'),
    ).toBeInTheDocument()
    expect(screen.getByText('referenceTextHint')).toBeInTheDocument()
  })

  it('shows the required-transcript hint when audio is uploaded but text is empty', () => {
    renderAudioParams({
      audioReferenceUrl: 'https://cdn.example.com/r.mp3',
      audioReferenceFileName: 'voice.mp3',
      audioReferenceText: '',
    })

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    expect(screen.getByText('voice.mp3')).toBeInTheDocument()
    expect(screen.getByText('referenceTextRequired')).toBeInTheDocument()
  })

  it('forwards transcript edits via onChangeAudioReferenceText', () => {
    const onChangeAudioReferenceText = vi.fn()
    renderAudioParams({
      audioReferenceUrl: 'https://cdn.example.com/r.mp3',
      audioReferenceFileName: 'voice.mp3',
      audioReferenceText: '',
      onChangeAudioReferenceText,
    })

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    fireEvent.change(screen.getByPlaceholderText('referenceTextPlaceholder'), {
      target: { value: 'Hello world.' },
    })
    expect(onChangeAudioReferenceText).toHaveBeenCalledWith('Hello world.')
  })

  it('clears the reference upload when the trash button is pressed', () => {
    const onChangeAudioReferenceUpload = vi.fn()
    renderAudioParams({
      audioReferenceUrl: 'https://cdn.example.com/r.mp3',
      audioReferenceFileName: 'voice.mp3',
      audioReferenceText: 'hi',
      onChangeAudioReferenceUpload,
    })

    fireEvent.click(screen.getByRole('button', { name: /advanced/ }))
    fireEvent.click(screen.getByRole('tab', { name: /tabVoice/ }))

    fireEvent.click(screen.getByRole('button', { name: 'referenceRemove' }))
    expect(onChangeAudioReferenceUpload).toHaveBeenCalledWith(null)
  })

  it('does not trigger the hover-preview audio when no demo file is configured', () => {
    vi.useFakeTimers()
    const playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockImplementation(function play(this: HTMLMediaElement) {
        return Promise.resolve()
      })

    try {
      renderAudioParams()

      // No demo files seeded in src — hovering must not spin up audio.
      fireEvent.mouseEnter(screen.getByText('styleCalm').closest('button')!)
      vi.advanceTimersByTime(2000)
      expect(playSpy).not.toHaveBeenCalled()
    } finally {
      playSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
