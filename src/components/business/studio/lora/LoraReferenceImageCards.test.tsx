import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { useImageUpload } from '@/hooks/use-image-upload'

import { LoraReferenceImageCards } from './LoraReferenceImageCards'

// The cards compose standalone pieces (ImagePickerPopoverBody, AssetSelectorDialog)
// that have their own suites and heavier deps; stub them so this stays a focused
// smoke test of the cards' own empty/filled presentation, and that it mounts
// without any Studio-context coupling.
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

// jsdom lacks ResizeObserver, which the ParamSlider (Radix Slider) touches on
// mount when a reference is attached (filled state).
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

describe('LoraReferenceImageCards (G3c)', () => {
  it('empty state: only a low add-reference entry, no big cards or strength', () => {
    render(
      <LoraReferenceImageCards
        imageUpload={makeImageUpload([])}
        strength={0.7}
        onStrengthChange={vi.fn()}
        strengthConfig={STRENGTH}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'ImageChip:addReference' }),
    ).toBeInTheDocument()
    // No filled card preview → no strength slider label reserved.
    expect(
      screen.queryByText('ImageChip:referenceStrength'),
    ).not.toBeInTheDocument()
  })

  it('filled state: renders a preview card, remove + add cards, and the strength slider', () => {
    render(
      <LoraReferenceImageCards
        imageUpload={makeImageUpload(['https://example.com/a.png'])}
        strength={0.7}
        onStrengthChange={vi.fn()}
        strengthConfig={STRENGTH}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'ImageChip:previewReferenceImage' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'ImageChip:removeReferenceImage' }),
    ).toBeInTheDocument()
    // Same-size ＋ add card at the end of the row.
    expect(
      screen.getByRole('button', { name: 'ImageChip:add' }),
    ).toBeInTheDocument()
    // Strength slider shows once there is a usable reference.
    expect(screen.getByText('ImageChip:referenceStrength')).toBeInTheDocument()
  })
})
