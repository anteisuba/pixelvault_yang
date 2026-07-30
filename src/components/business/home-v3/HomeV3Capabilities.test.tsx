import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { HomeV3Capabilities } from './HomeV3Capabilities'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'play') return 'Play video'
    if (key === 'pause') return 'Pause video'
    if (key === 'seek') return 'Seek video'
    return key
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/components/business/ModelViewer', () => ({
  ModelViewer: () => null,
}))

describe('HomeV3Capabilities video demo', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes a real play control instead of a decorative icon', () => {
    render(<HomeV3Capabilities />)

    expect(
      screen.getByRole('button', { name: 'Play video' }),
    ).toBeInTheDocument()
  })

  it('plays when the user clicks the play control', () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play)
    render(<HomeV3Capabilities />)
    const callsBeforeClick = play.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))

    expect(play).toHaveBeenCalledTimes(callsBeforeClick + 1)
  })

  it('pauses when the user clicks the active control', () => {
    const { container } = render(<HomeV3Capabilities />)
    const video = container.querySelector('video')
    if (!video) throw new Error('Expected the homepage video element')

    Object.defineProperty(video, 'paused', {
      configurable: true,
      value: false,
    })
    fireEvent.play(video)
    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })
})
