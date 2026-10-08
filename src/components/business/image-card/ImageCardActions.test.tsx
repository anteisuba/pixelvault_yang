import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageCardActions } from './ImageCardActions'

describe('ImageCardActions', () => {
  it('draws a different heart once liked, not just a different colour', () => {
    const heart = (liked: boolean) => {
      const { unmount } = render(
        <ImageCardActions
          liked={liked}
          likeCount={0}
          isLikePending={false}
          isDownloading={false}
          onLike={vi.fn()}
          onDownload={vi.fn()}
          likeLabel="like"
          unlikeLabel="unlike"
          downloadLabel="download"
        />,
      )
      const markup = screen
        .getByRole('button', { name: liked ? 'unlike' : 'like' })
        .querySelector('svg')!.innerHTML
      unmount()
      return markup
    }
    expect(heart(true)).not.toBe(heart(false))
  })

  it('rolls the like count to the new value and reads it once', () => {
    const props = {
      isLikePending: false,
      isDownloading: false,
      onLike: vi.fn(),
      onDownload: vi.fn(),
      likeLabel: 'like',
      unlikeLabel: 'unlike',
      downloadLabel: 'download',
    }
    const { container, rerender } = render(
      <ImageCardActions {...props} liked={false} likeCount={9} />,
    )
    expect(container.querySelectorAll('.number-roll-cell')).toHaveLength(1)

    rerender(<ImageCardActions {...props} liked likeCount={10} />)
    const button = screen.getByRole('button', { name: 'unlike' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button.querySelector('.sr-only')).toHaveTextContent(/^10$/)
    expect(container.querySelectorAll('.number-roll-cell')).toHaveLength(2)
  })
})
