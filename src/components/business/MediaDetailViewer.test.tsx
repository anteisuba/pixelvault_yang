import { fireEvent, render, screen } from '@testing-library/react'

import { MediaDetailViewer } from '@/components/business/MediaDetailViewer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderViewer(onOpenChange = vi.fn()) {
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
})
