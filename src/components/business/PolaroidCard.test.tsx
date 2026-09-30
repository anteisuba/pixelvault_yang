import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PolaroidCard } from './PolaroidCard'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderCard(liked: boolean, featured = liked) {
  return render(
    <PolaroidCard
      id="g1"
      url="https://cdn.test.com/a.png"
      outputType="IMAGE"
      prompt="p"
      model="m"
      createdAt="2026-09-28"
      width={100}
      height={100}
      likeCount={0}
      isLiked={liked}
      isFeatured={featured}
      totalImages={1}
      isOwnProfile
      onLike={vi.fn()}
      onPin={vi.fn()}
    />,
  )
}

describe('PolaroidCard', () => {
  it('draws a solid heart once liked', () => {
    const heart = (on: boolean) => {
      const { container, unmount } = renderCard(on, false)
      const markup = container.querySelector('svg.size-3')!.innerHTML
      unmount()
      return markup
    }
    expect(heart(true)).not.toBe(heart(false))
  })

  it('draws solid pin and heart buttons once pinned and liked', () => {
    const icons = (on: boolean) => {
      const { unmount } = renderCard(on)
      fireEvent.click(screen.getByRole('button', { name: /imageBy/ }))
      const markup = [on ? 'unpin' : 'pin', on ? 'unlike' : 'like'].map(
        (name) =>
          screen.getByRole('button', { name }).querySelector('svg')!.innerHTML,
      )
      unmount()
      return markup
    }
    const [pinOn, heartOn] = icons(true)
    const [pinOff, heartOff] = icons(false)
    expect(pinOn).not.toBe(pinOff)
    expect(heartOn).not.toBe(heartOff)
  })
})
