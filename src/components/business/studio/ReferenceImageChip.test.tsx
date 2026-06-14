import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ReferenceImageChip } from './ReferenceImageChip'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockImageUpload = vi.hoisted(() => ({
  referenceEntries: [{ id: 'reference-1' }],
  referenceImages: ['data:image/png;base64,reference'],
  addReferenceImage: vi.fn(),
  addFromUrl: vi.fn(),
  removeReferenceImage: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { panels: { refImage: true } },
    dispatch: mockDispatch,
  }),
  useStudioData: () => ({
    imageUpload: mockImageUpload,
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/ImageAttachmentPreviewStrip', () => ({
  ImageAttachmentPreviewStrip: () => null,
}))

vi.mock('@/components/business/ImageSourcePicker', () => ({
  ImageSourcePicker: ({ variant }: { variant?: string }) => (
    <div data-testid="image-source-picker" data-variant={variant ?? 'pill'} />
  ),
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  StudioChipBadge: ({
    children,
    title,
    ariaLabel,
  }: {
    children: ReactNode
    title?: string
    ariaLabel?: string
  }) => (
    <span title={title} aria-label={ariaLabel}>
      {children}
    </span>
  ),
  StudioToolSurface: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioToolSurfaceTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  StudioToolPopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  studioChipActiveClass: 'studio-chip-active',
  studioToolTriggerClass: '',
}))

describe('ReferenceImageChip', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    mockImageUpload.referenceEntries = [{ id: 'reference-1' }]
    mockImageUpload.referenceImages = ['data:image/png;base64,reference']
  })

  it('opens layer decomposition from the image panel', () => {
    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'layerDecompose' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'CLOSE_PANEL',
      payload: 'refImage',
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'layerDecompose',
    })
  })

  it('uses card source actions and keeps layer decomposition visible while empty', () => {
    mockImageUpload.referenceEntries = []
    mockImageUpload.referenceImages = []

    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    expect(screen.getByTestId('image-source-picker')).toHaveAttribute(
      'data-variant',
      'card',
    )
    expect(screen.getByRole('button', { name: 'layerDecompose' })).toHaveClass(
      'min-h-11',
      'w-full',
      'justify-start',
    )
  })
})
