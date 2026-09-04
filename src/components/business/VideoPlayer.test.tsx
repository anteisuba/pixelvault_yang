import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import VideoPlayer from './VideoPlayer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/api-client/shared', () => ({
  downloadRemoteAsset: vi.fn(),
}))

describe('VideoPlayer sizing', () => {
  it('uses intrinsic video dimensions in contain mode', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/portrait.mp4" fit="contain" />,
    )

    expect(container.firstElementChild).toHaveClass('video-player--contain')
    expect(container.querySelector('video')).toHaveClass(
      'video-player-media--contain',
    )
    expect(container.querySelector('video')).not.toHaveClass('w-full')
  })

  it('keeps the existing fill behavior by default', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/landscape.mp4" />,
    )

    expect(container.firstElementChild).not.toHaveClass('video-player--contain')
    expect(container.querySelector('video')).toHaveClass('w-full')
  })
})
