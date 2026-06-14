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

function renderPicker(variant?: 'pill' | 'card') {
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

  it('renders card actions as equal-width vertical source cards', () => {
    renderPicker('card')

    for (const label of ['Upload', 'Select asset']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveClass(
        'min-h-28',
        'flex-1',
        'flex-col',
        'items-center',
        'justify-center',
        'rounded-xl',
        'border-border/50',
        'text-xs',
        'duration-base',
        'ease-standard',
      )
      // Icon well: balanced 44px squircle (not the oversized 72px circle), with
      // an inset hairline so it reads as a raised layer on the card.
      const well = button.querySelector('.size-11')
      expect(well).not.toBeNull()
      expect(well).toHaveClass('rounded-xl', 'ring-inset')
    }
  })

  it('uses a non-solid primary drag highlight', () => {
    dragState.isDragging = true
    renderPicker('card')

    const upload = screen.getByRole('button', { name: 'Upload' })
    expect(upload).toHaveClass('bg-primary/10', 'ring-2', 'ring-primary/40')
    expect(upload).not.toHaveClass('bg-primary')
    expect(upload).not.toHaveClass('text-primary-foreground')
  })
})
