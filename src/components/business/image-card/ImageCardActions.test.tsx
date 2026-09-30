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
})
