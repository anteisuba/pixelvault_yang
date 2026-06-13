import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ReferenceImageChip } from './ReferenceImageChip'

const mockDispatch = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { panels: { refImage: true } },
    dispatch: mockDispatch,
  }),
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: [],
      referenceImages: [],
      addReferenceImage: vi.fn(),
      addFromUrl: vi.fn(),
      removeReferenceImage: vi.fn(),
    },
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/ImageAttachmentPreviewStrip', () => ({
  ImageAttachmentPreviewStrip: () => null,
}))

vi.mock('@/components/business/ImageSourcePicker', () => ({
  ImageSourcePicker: () => <div data-testid="image-source-picker" />,
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
})
