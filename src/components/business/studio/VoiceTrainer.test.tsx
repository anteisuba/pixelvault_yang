import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VoiceTrainer } from './VoiceTrainer'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, vars?: Record<string, unknown>): string => {
      if (!vars) return key
      return `${key}:${JSON.stringify(vars)}`
    },
}))

const dispatchMock = vi.fn()
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: {}, dispatch: dispatchMock }),
}))

const refreshMock = vi.fn(async () => {})
vi.mock('@/hooks/use-voice-cards', () => ({
  useVoiceCards: () => ({
    cards: [],
    isLoading: false,
    error: null,
    findCard: () => null,
    refresh: refreshMock,
  }),
}))

const createVoiceMock = vi.fn()
const transcribeVoiceMock = vi.fn()
vi.mock('@/lib/api-client', () => ({
  createVoiceAPI: (...args: unknown[]) => createVoiceMock(...args),
  transcribeVoiceAPI: (...args: unknown[]) => transcribeVoiceMock(...args),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

function makeAudioFile(name: string, size: number, type = 'audio/mpeg'): File {
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement | null
  if (!input) throw new Error('file input not found')
  return input
}

function pickFiles(files: File[]) {
  const input = fileInput()
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

describe('VoiceTrainer', () => {
  afterEach(() => {
    dispatchMock.mockReset()
    refreshMock.mockClear()
    createVoiceMock.mockReset()
    transcribeVoiceMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('renders the empty form with the train button disabled', () => {
    render(<VoiceTrainer />)
    expect(screen.getByText('voiceTrainName')).toBeInTheDocument()
    expect(screen.getByText('voiceTrainAudio')).toBeInTheDocument()
    expect(
      screen.getByText('voiceTrainCreate').closest('button'),
    ).toBeDisabled()
  })

  it('accepts a file and lets the user remove it', () => {
    render(<VoiceTrainer />)
    pickFiles([makeAudioFile('clip.mp3', 1024)])
    expect(screen.getByText('clip.mp3')).toBeInTheDocument()

    // The remove button sits on the file row — it's the icon-only button
    // that lives inside the same row as the file name.
    const row = screen.getByText('clip.mp3').closest('div')!
    const removeButton = row.querySelector('button') as HTMLButtonElement
    fireEvent.click(removeButton)
    expect(screen.queryByText('clip.mp3')).not.toBeInTheDocument()
  })

  it('rejects files larger than the per-file cap and shows a toast', () => {
    render(<VoiceTrainer />)
    pickFiles([makeAudioFile('huge.mp3', 11 * 1024 * 1024)])

    expect(toastError).toHaveBeenCalled()
    expect(toastError.mock.calls[0]?.[0]).toMatch(/voiceTrainFileTooLarge/)
    expect(screen.queryByText('huge.mp3')).not.toBeInTheDocument()
  })

  it('caps the file count to VOICE_TRAIN_MAX_FILES (8) per selection', () => {
    render(<VoiceTrainer />)
    const nine = Array.from({ length: 9 }, (_, i) =>
      makeAudioFile(`c${i}.mp3`, 1024),
    )
    pickFiles(nine)

    expect(toastError).toHaveBeenCalled()
    expect(toastError.mock.calls[0]?.[0]).toMatch(/voiceTrainTooManyFiles/)
    // First 8 are accepted, the 9th is dropped.
    for (let i = 0; i < 8; i += 1) {
      expect(screen.getByText(`c${i}.mp3`)).toBeInTheDocument()
    }
    expect(screen.queryByText('c8.mp3')).not.toBeInTheDocument()
  })

  it('clones successfully and refreshes the voice cards list', async () => {
    createVoiceMock.mockResolvedValue({
      success: true,
      data: { id: 'fish-voice-1' },
      voiceCard: { id: 'card-1', voiceId: 'fish-voice-1' },
    })

    render(<VoiceTrainer />)
    fireEvent.change(screen.getByPlaceholderText('voiceTrainNamePlaceholder'), {
      target: { value: 'My Voice' },
    })
    pickFiles([makeAudioFile('clip.mp3', 1024)])

    fireEvent.click(screen.getByText('voiceTrainCreate'))

    await waitFor(() => expect(createVoiceMock).toHaveBeenCalled())
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_VOICE_CARD_ID',
      payload: 'card-1',
    })
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_VOICE_ID',
      payload: 'fish-voice-1',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalledWith('voiceTrainSuccess')
    // Form is reset on success.
    expect(screen.queryByText('clip.mp3')).not.toBeInTheDocument()
  })

  it('surfaces the missing-API-key error with the friendly message', async () => {
    createVoiceMock.mockResolvedValue({
      success: false,
      errorCode: 'MISSING_API_KEY',
      error: 'raw',
    })

    render(<VoiceTrainer />)
    fireEvent.change(screen.getByPlaceholderText('voiceTrainNamePlaceholder'), {
      target: { value: 'My Voice' },
    })
    pickFiles([makeAudioFile('clip.mp3', 1024)])
    fireEvent.click(screen.getByText('voiceTrainCreate'))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0]?.[0]).toBe('voiceApiKeyRequired')
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows the uploading-stage label immediately after train is clicked', async () => {
    let resolveCreate: (value: unknown) => void = () => {}
    createVoiceMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    render(<VoiceTrainer />)
    fireEvent.change(screen.getByPlaceholderText('voiceTrainNamePlaceholder'), {
      target: { value: 'My Voice' },
    })
    pickFiles([makeAudioFile('clip.mp3', 1024)])

    fireEvent.click(screen.getByText('voiceTrainCreate'))

    // The "uploading" label is what proves the user gets immediate feedback
    // when they hit Create. The 1500ms → finalizing transition is a pure
    // setTimeout schedule and is not worth wrestling fake timers for.
    await waitFor(() =>
      expect(screen.getByText('voiceTrainStageUploading')).toBeInTheDocument(),
    )
    expect(screen.queryByText('voiceTrainCreate')).not.toBeInTheDocument()

    // Resolving the request returns the button to idle.
    await act(async () => {
      resolveCreate({
        success: true,
        data: { id: 'v-1' },
        voiceCard: { id: 'c-1', voiceId: 'v-1' },
      })
    })

    await waitFor(() =>
      expect(screen.getByText('voiceTrainCreate')).toBeInTheDocument(),
    )
  })

  it('labels the transcribe button to flag first-file-only with multiple files', () => {
    render(<VoiceTrainer />)

    pickFiles([makeAudioFile('a.mp3', 1024)])
    expect(screen.getByText('voiceTranscribe')).toBeInTheDocument()
    expect(screen.queryByText('voiceTranscribeFirst')).not.toBeInTheDocument()

    pickFiles([makeAudioFile('b.mp3', 1024)])
    expect(screen.getByText('voiceTranscribeFirst')).toBeInTheDocument()
    expect(screen.queryByText('voiceTranscribe')).not.toBeInTheDocument()
  })

  it('fills the transcript via the auto-transcribe button', async () => {
    transcribeVoiceMock.mockResolvedValue({
      success: true,
      data: { text: 'hello there' },
    })

    render(<VoiceTrainer />)
    pickFiles([makeAudioFile('clip.mp3', 1024)])
    fireEvent.click(screen.getByText('voiceTranscribe'))

    await waitFor(() => expect(transcribeVoiceMock).toHaveBeenCalled())
    const transcriptInput = screen.getByPlaceholderText(
      'voiceTrainTranscriptPlaceholder',
    ) as HTMLTextAreaElement
    expect(transcriptInput.value).toBe('hello there')
    expect(toastSuccess).toHaveBeenCalledWith('voiceTranscribeSuccess')
  })
})
