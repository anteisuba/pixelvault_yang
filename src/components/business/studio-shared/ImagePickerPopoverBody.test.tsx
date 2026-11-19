import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImagePickerPopoverBody } from './ImagePickerPopoverBody'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn().mockResolvedValue({
    success: true,
    data: { generations: [] },
  }),
}))

describe('ImagePickerPopoverBody', () => {
  it('disables add sources and renders the supplied reason', async () => {
    render(
      <ImagePickerPopoverBody
        dropHint="Upload image"
        recentLabel="Recent"
        recentEmptyLabel="Empty"
        openLibraryLabel="Open library"
        disabledReason="The reference image limit is full"
        onPickFile={vi.fn()}
        onDropFile={vi.fn()}
        onPickAsset={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    )

    expect(screen.getByText('The reference image limit is full')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open library' })).toBeDisabled()
    expect(await screen.findByText('Empty')).toBeVisible()
  })
  it('最近素材还在取时画同形灰块，到了就换掉', async () => {
    render(
      <ImagePickerPopoverBody
        dropHint="Upload image"
        recentLabel="Recent"
        recentEmptyLabel="Empty"
        openLibraryLabel="Open library"
        onPickFile={vi.fn()}
        onDropFile={vi.fn()}
        onPickAsset={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    )
    const skeleton = screen.getByTestId('image-picker-recent-skeleton')
    expect(skeleton.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8)
    expect(await screen.findByText('Empty')).toBeVisible()
    expect(screen.queryByTestId('image-picker-recent-skeleton')).toBeNull()
  })
  it('keeps clicks inside the picker from focusing its parent prompt', async () => {
    const parentClick = vi.fn()
    const openLibrary = vi.fn()
    render(
      <div onClick={parentClick}>
        <ImagePickerPopoverBody
          dropHint="Upload image"
          recentLabel="Recent"
          recentEmptyLabel="Empty"
          openLibraryLabel="Open library"
          onPickFile={vi.fn()}
          onDropFile={vi.fn()}
          onPickAsset={vi.fn()}
          onOpenLibrary={openLibrary}
        />
      </div>,
    )
    expect(await screen.findByText('Empty')).toBeVisible()
    fireEvent.click(screen.getByText('Recent'))
    expect(parentClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open library' }))
    expect(openLibrary).toHaveBeenCalledOnce()
  })
})
