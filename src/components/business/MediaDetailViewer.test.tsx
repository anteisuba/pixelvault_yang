import { fireEvent, render, screen } from '@testing-library/react'

import {
  MediaDetailViewer,
  type MediaDetailNavigation,
} from '@/components/business/MediaDetailViewer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderViewer(
  onOpenChange = vi.fn(),
  navigation?: MediaDetailNavigation,
) {
  render(
    <MediaDetailViewer
      open
      onOpenChange={onOpenChange}
      title="Asset details"
      description="Inspect the asset"
      closeLabel="Close"
      media={<video data-testid="detail-video" />}
      sideHeader={<div>Header</div>}
      sideContent={<div>Content</div>}
      footerActions={<div>Actions</div>}
      navigation={navigation}
    />,
  )

  const video = screen.getByTestId('detail-video')
  const mediaFrame = video.parentElement
  const mediaSection = video.closest('section')

  if (!mediaFrame || !mediaSection) {
    throw new Error('Media viewer structure is missing')
  }

  vi.spyOn(mediaFrame, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 10, 100, 100),
  )

  return { mediaSection, onOpenChange }
}

describe('MediaDetailViewer', () => {
  it('keeps the decorative media layer transparent to native controls', () => {
    const { mediaSection } = renderViewer()

    expect(mediaSection).toHaveClass('before:pointer-events-none')
  })

  it('closes the viewer when the media backdrop itself is clicked', () => {
    const { mediaSection, onOpenChange } = renderViewer()

    fireEvent.click(mediaSection, { clientX: 200, clientY: 200 })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('switches media with arrow controls and keyboard shortcuts', () => {
    const onOpenChange = vi.fn()
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    renderViewer(onOpenChange, {
      previousLabel: 'Previous image',
      nextLabel: 'Next image',
      canGoPrevious: true,
      canGoNext: true,
      direction: 1,
      onPrevious,
      onNext,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }))
    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('disables navigation at the current image boundary', () => {
    renderViewer(vi.fn(), {
      previousLabel: 'Previous image',
      nextLabel: 'Next image',
      canGoPrevious: false,
      canGoNext: true,
      direction: 1,
      onPrevious: vi.fn(),
      onNext: vi.fn(),
    })

    expect(
      screen.getByRole('button', { name: 'Previous image' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next image' })).toBeEnabled()
  })
})
