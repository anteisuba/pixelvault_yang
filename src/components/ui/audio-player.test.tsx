import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioPlayer } from './audio-player'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

function setAudioTiming(duration: number, currentTime = 0): HTMLAudioElement {
  const audio = document.querySelector('audio')
  if (!(audio instanceof HTMLAudioElement)) {
    throw new Error('Audio element was not rendered')
  }

  Object.defineProperty(audio, 'duration', {
    configurable: true,
    value: duration,
  })
  audio.currentTime = currentTime
  fireEvent.loadedMetadata(audio)
  fireEvent.timeUpdate(audio)
  return audio
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(
      function play(this: HTMLMediaElement) {
        this.dispatchEvent(new Event('play'))
        return Promise.resolve()
      },
    )
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(
      function pause(this: HTMLMediaElement) {
        this.dispatchEvent(new Event('pause'))
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders waveform, playback speed, download, and optional segments', () => {
    render(
      <AudioPlayer
        src="/audio.mp3"
        segments={[{ text: 'Hello world', start: 0, end: 1.2 }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'waveform' })).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'playbackRate' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'download' })).toHaveAttribute(
      'href',
      '/audio.mp3',
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('plays, pauses, and updates playback speed', async () => {
    render(<AudioPlayer src="/audio.mp3" />)
    const audio = setAudioTiming(20)

    fireEvent.click(screen.getByRole('button', { name: 'play' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'pause' })).toBeInTheDocument(),
    )
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled()

    fireEvent.change(screen.getByRole('combobox', { name: 'playbackRate' }), {
      target: { value: '1.25' },
    })

    await waitFor(() => expect(audio.playbackRate).toBe(1.25))

    fireEvent.click(screen.getByRole('button', { name: 'pause' }))

    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  it('supports skip buttons, segment seek, and spacebar playback', () => {
    render(
      <AudioPlayer
        src="/audio.mp3"
        segments={[{ text: 'Second line', start: 5, end: 8 }]}
      />,
    )
    const audio = setAudioTiming(20, 10)

    fireEvent.click(screen.getByRole('button', { name: 'forward' }))
    expect(audio.currentTime).toBe(15)

    fireEvent.click(screen.getByRole('button', { name: 'rewind' }))
    expect(audio.currentTime).toBe(10)

    fireEvent.click(screen.getByText('Second line'))
    expect(audio.currentTime).toBe(5)

    fireEvent.keyDown(screen.getByRole('group', { name: 'player' }), {
      key: ' ',
    })
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled()
  })
})
