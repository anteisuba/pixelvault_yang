import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CivitaiPreviewImage } from '@/types'

import { LoraSourceImagePreviewStrip } from './LoraSourceImagePreviewStrip'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}))

const PREVIEW: CivitaiPreviewImage = {
  imageUrl: 'https://image.civitai.com/example-1.jpeg',
  width: 832,
  height: 1216,
  nsfwLevel: 1,
}

describe('LoraSourceImagePreviewStrip', () => {
  it('renders nothing when there are no preview images', () => {
    const { container } = render(
      <LoraSourceImagePreviewStrip assetName="Aemeath" previewImages={[]} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows the no-recipe hint plus preview thumbnails and opens a lightbox on click', async () => {
    render(
      <LoraSourceImagePreviewStrip
        assetName="Aemeath"
        previewImages={[PREVIEW]}
      />,
    )

    // 「作者未提供配方参数」说明文案。
    screen.getByText('previewOnlyHint')

    // 纯预览缩略图（可点开大图，但不涉及配方/生成）。
    const thumb = screen.getByRole('button', {
      name: /sourceImagePreviewLabel/,
    })
    fireEvent.click(thumb)

    await waitFor(() => {
      screen.getByRole('dialog')
    })
  })

  it('renders the author description text and copies it on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(
      <LoraSourceImagePreviewStrip
        assetName="Aemeath"
        previewImages={[]}
        descriptionText={'Lora提示词：\nAemeath, long hair, pink hair'}
      />,
    )

    // 作者描述原样渲染（含换行）。
    screen.getByText('descriptionLabel')
    screen.getByText(/Aemeath, long hair, pink hair/)

    fireEvent.click(screen.getByRole('button', { name: /descriptionCopy/ }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'Lora提示词：\nAemeath, long hair, pink hair',
      )
      expect(toastSuccess).toHaveBeenCalled()
    })
  })

  it('renders nothing when there are neither preview images nor a description', () => {
    const { container } = render(
      <LoraSourceImagePreviewStrip
        assetName="Aemeath"
        previewImages={[]}
        descriptionText="   "
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
