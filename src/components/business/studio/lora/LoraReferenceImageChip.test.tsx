import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { useImageUpload } from '@/hooks/use-image-upload'

import { LoraReferenceImageChip } from './LoraReferenceImageChip'

// The chip composes standalone pieces (ImagePickerPopoverBody, AssetSelectorDialog)
// that have their own suites and heavier deps; stub them so this test stays a
// focused smoke test of the chip's own trigger/badge logic and, crucially,
// that it mounts without any Studio-context coupling.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `ImageChip:${key}`,
}))
vi.mock('@/components/business/studio-shared/ImagePickerPopoverBody', () => ({
  ImagePickerPopoverBody: () => <div data-testid="image-picker-popover-body" />,
}))
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

const STRENGTH = { min: 0.01, max: 0.99, step: 0.01, default: 0.7 }

function makeImageUpload(
  referenceImages: string[],
): ReturnType<typeof useImageUpload> {
  return {
    referenceImage: referenceImages[0],
    referenceImages,
    referenceEntries: referenceImages.map((url) => ({
      url,
      disabledReason: null,
    })),
    setReferenceImage: vi.fn(),
    addReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
    clearAllImages: vi.fn(),
    addFromUrl: vi.fn(),
    setMaxImages: vi.fn(),
    isDragging: false,
    setIsDragging: vi.fn(),
    fileInputRef: { current: null },
    handleFileChange: vi.fn(),
    handleDrop: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    openFilePicker: vi.fn(),
    handleInputChange: vi.fn(),
    clearImage: vi.fn(),
    isUploading: false,
  } as unknown as ReturnType<typeof useImageUpload>
}

describe('LoraReferenceImageChip (B9)', () => {
  it('renders the trigger chip without any Studio context', () => {
    render(
      <LoraReferenceImageChip
        imageUpload={makeImageUpload([])}
        strength={0.7}
        onStrengthChange={vi.fn()}
        strengthConfig={STRENGTH}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'ImageChip:label' }),
    ).toBeInTheDocument()
    // No attachment yet → no count badge.
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('shows a count badge reflecting the number of attached entries', () => {
    render(
      <LoraReferenceImageChip
        imageUpload={makeImageUpload(['https://example.com/a.png'])}
        strength={0.7}
        onStrengthChange={vi.fn()}
        strengthConfig={STRENGTH}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'ImageChip:label' })
    expect(trigger).toHaveTextContent('1')
  })
})
