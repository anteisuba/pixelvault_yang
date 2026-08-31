import { render, screen } from '@testing-library/react'
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
})
