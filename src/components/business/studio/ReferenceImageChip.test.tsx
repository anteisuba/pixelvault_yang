import { render, screen } from '@testing-library/react'
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

vi.mock('@/components/business/studio-shared/ImagePickerPopoverBody', () => ({
  ImagePickerPopoverBody: ({
    headerSlot,
    footerSlot,
  }: {
    headerSlot?: ReactNode
    footerSlot?: ReactNode
  }) => (
    <div data-testid="image-picker-popover-body">
      {headerSlot}
      {footerSlot}
    </div>
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

  it('renders the shared image picker while empty', () => {
    mockImageUpload.referenceEntries = []
    mockImageUpload.referenceImages = []

    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    expect(screen.getByTestId('image-picker-popover-body')).toBeInTheDocument()
  })
})
