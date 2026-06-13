import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageSourcePicker } from './ImageSourcePicker'

const dragState = vi.hoisted(() => ({
  isDragging: false,
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/hooks/use-stable-drag-state', () => ({
  useStableDragState: () => ({
    isDragging: dragState.isDragging,
    resetDragging: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
  }),
}))

function renderPicker(variant?: 'pill' | 'row') {
  render(
    <ImageSourcePicker
      variant={variant}
      description="Pick a reference"
      uploadLabel="Upload"
      uploadHint="Upload a local image"
      selectAssetLabel="Select asset"
      assetDialogTitle="Select asset"
      assetDialogDescription="Pick from assets"
      onFileSelect={vi.fn()}
      onAssetSelect={vi.fn()}
    />,
  )
}

describe('ImageSourcePicker', () => {
  beforeEach(() => {
    dragState.isDragging = false
  })

  it('keeps the default pill variant for existing callers', () => {
    renderPicker()

    expect(screen.getByRole('button', { name: 'Upload' })).toHaveClass(
      'rounded-full',
      'h-11',
      'justify-center',
    )
    expect(screen.getByRole('button', { name: 'Select asset' })).toHaveClass(
      'rounded-full',
      'h-10',
      'justify-center',
    )
  })

  it('renders row actions as full-width left-aligned controls', () => {
    renderPicker('row')

    for (const label of ['Upload', 'Select asset']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass(
        'min-h-11',
        'w-full',
        'justify-start',
        'rounded-xl',
        'px-3',
        'py-2.5',
        'duration-base',
        'ease-standard',
      )
    }
  })

  it('uses a non-solid primary drag highlight', () => {
    dragState.isDragging = true
    renderPicker('row')

    const upload = screen.getByRole('button', { name: 'Upload' })
    expect(upload).toHaveClass('bg-primary/10', 'ring-2', 'ring-primary/40')
    expect(upload).not.toHaveClass('bg-primary')
    expect(upload).not.toHaveClass('text-primary-foreground')
  })
})
