import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioTranscribeDialog } from './AudioTranscribeDialog'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, vars?: Record<string, unknown>): string => {
      if (!vars) return key
      return `${key}:${JSON.stringify(vars)}`
    },
}))

const dispatchMock = vi.fn()
const useStudioFormState = { prompt: '' }
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: useStudioFormState,
    dispatch: dispatchMock,
  }),
}))

const transcribeMock = vi.fn()
vi.mock('@/lib/api-client', () => ({
  transcribeVoiceAPI: (...args: unknown[]) => transcribeMock(...args),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
const toastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}))

function makeAudioFile(name: string, size: number, type = 'audio/mpeg'): File {
  // Backed by a Blob so size is honoured by the File constructor.
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

async function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('AudioTranscribeDialog', () => {
  beforeEach(() => {
    useStudioFormState.prompt = ''
  })

  afterEach(() => {
    dispatchMock.mockReset()
    transcribeMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    toastWarning.mockReset()
  })

  it('shows the upload prompt until a file is picked', () => {
    render(<AudioTranscribeDialog />)
    expect(screen.getByText('pickFile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /transcribe$/ })).toBeDisabled()
  })

  it('rejects oversized audio files before any network call', async () => {
    render(<AudioTranscribeDialog />)
    await pickFile(makeAudioFile('huge.mp3', 30 * 1024 * 1024))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0]?.[0]).toMatch(/errorTooLarge/)
    expect(transcribeMock).not.toHaveBeenCalled()
  })

  it('rejects non-audio files', async () => {
    render(<AudioTranscribeDialog />)
    await pickFile(makeAudioFile('note.txt', 100, 'text/plain'))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0]?.[0]).toBe('errorNotAudio')
  })

  it('replaces an empty prompt with the transcribed text on success', async () => {
    transcribeMock.mockResolvedValue({
      success: true,
      data: { text: '  hello world  ', duration: 1.2, segments: [] },
    })

    const onComplete = vi.fn()
    render(<AudioTranscribeDialog onComplete={onComplete} />)
    await pickFile(makeAudioFile('clip.mp3', 1024))

    fireEvent.click(screen.getByRole('button', { name: /transcribe$/ }))

    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SET_PROMPT',
        payload: 'hello world',
      }),
    )
    expect(toastSuccess).toHaveBeenCalledWith('success')
    expect(onComplete).toHaveBeenCalled()
  })

  it('appends to an existing prompt instead of overwriting in-progress work', async () => {
    useStudioFormState.prompt = 'Existing draft.'
    transcribeMock.mockResolvedValue({
      success: true,
      data: { text: 'Second sentence.', duration: 1, segments: [] },
    })

    render(<AudioTranscribeDialog />)
    await pickFile(makeAudioFile('clip.mp3', 1024))
    fireEvent.click(screen.getByRole('button', { name: /transcribe$/ }))

    await waitFor(() =>
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'SET_PROMPT',
        payload: 'Existing draft.\n\nSecond sentence.',
      }),
    )
  })

  it('surfaces the API key error code with a friendlier message', async () => {
    transcribeMock.mockResolvedValue({
      success: false,
      errorCode: 'MISSING_API_KEY',
      error: 'raw error',
    })

    render(<AudioTranscribeDialog />)
    await pickFile(makeAudioFile('clip.mp3', 1024))
    fireEvent.click(screen.getByRole('button', { name: /transcribe$/ }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0]?.[0]).toBe('errorApiKeyRequired')
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('warns instead of writing an empty transcript', async () => {
    transcribeMock.mockResolvedValue({
      success: true,
      data: { text: '   ', duration: 0, segments: [] },
    })

    render(<AudioTranscribeDialog />)
    await pickFile(makeAudioFile('clip.mp3', 1024))
    fireEvent.click(screen.getByRole('button', { name: /transcribe$/ }))

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastWarning.mock.calls[0]?.[0]).toBe('errorEmptyResult')
    expect(dispatchMock).not.toHaveBeenCalled()
  })
})
