import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { useImageUpload } from '@/hooks/use-image-upload'

import { LoraReferenceImageCards } from './LoraReferenceImageCards'

// 卡片里组的素材库选择器、图片来源弹层都是真的（关着不发请求）；这里看卡片自己的
// 空 / 有图两种样子，以及它不依赖 Studio 上下文也能挂上。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `ImageChip:${key}`,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
      // 空态入口文案改为「添加参考图 · 上传 / 粘贴 / 素材库」（CD 装配栏点明三条来路）。
      screen.getByRole('button', { name: 'ImageChip:addReferenceLong' }),
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
