import { fireEvent, render } from '@testing-library/react'
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

  it('fills the host box and letterboxes the media in box mode', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/square.mp4" fit="box" />,
    )

    expect(container.firstElementChild).toHaveClass('size-full')
    expect(container.firstElementChild).not.toHaveClass('video-player--contain')
    const video = container.querySelector('video')
    expect(video).toHaveClass('size-full', 'object-contain')
    // ⚠ 按视口封顶的那条类会让片子冲出比视口矮的舞台框、被切掉上下沿。
    expect(video).not.toHaveClass('video-player-media--contain')
  })

  it('offers a mute toggle next to play / pause', () => {
    const { getByRole } = render(
      <VideoPlayer src="https://cdn.example.com/square.mp4" fit="box" />,
    )
    const mute = getByRole('button', { name: 'mute' })
    fireEvent.click(mute)
    expect(getByRole('button', { name: 'unmute' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps the existing fill behavior by default', () => {
    const { container } = render(
      <VideoPlayer src="https://cdn.example.com/landscape.mp4" />,
    )

    expect(container.firstElementChild).not.toHaveClass('video-player--contain')
    expect(container.querySelector('video')).toHaveClass('w-full')
  })
})
