import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ReferenceImageChip } from './ReferenceImageChip'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockImageUpload = vi.hoisted(() => ({
  referenceEntries: [{ id: 'reference-1' }],
  referenceImages: ['data:image/png;base64,reference'],
  maxImages: 30,
  addReferenceImage: vi.fn(),
  addFromUrl: vi.fn(),
  removeReferenceImage: vi.fn(),
  handleFileChange: vi.fn(),
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
  AssetSelectorDialog: ({
    open,
    maxSelection,
  }: {
    open: boolean
    maxSelection?: number
  }) =>
    open ? (
      <div role="dialog" data-max={maxSelection}>
        asset-picker
      </div>
    ) : null,
}))

vi.mock('@/components/business/ImageAttachmentPreviewStrip', () => ({
  ImageAttachmentPreviewStrip: () => null,
}))

vi.mock('@/components/business/studio-shared/ImagePickerPopoverBody', () => ({
  ImagePickerPopoverBody: ({
    headerSlot,
    footerSlot,
    disabledReason,
    onOpenLibrary,
  }: {
    headerSlot?: ReactNode
    footerSlot?: ReactNode
    disabledReason?: string
    onOpenLibrary: () => void
  }) => (
    <div data-testid="image-picker-popover-body">
      {headerSlot}
      <button type="button" onClick={onOpenLibrary}>
        open-library
      </button>
      <button type="button" disabled={Boolean(disabledReason)}>
        {disabledReason ?? 'picker-enabled'}
      </button>
      {footerSlot}
    </div>
  ),
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  useStudioChipClasses: () => ({
    look: 'ghost',
    trigger: '',
    open: '',
    set: '',
  }),
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
    mockImageUpload.maxImages = 30
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

  it('⭐ 上传走 R2 那条路，不再把整张图 base64 塞进生成请求', () => {
    // ⚠ 这条 413 是真机撞出来的：base64 膨胀 ~33%，一张 3.4MB 的图就能把
    //   `POST /api/studio/generate` 的 body 顶到 Vercel Serverless 的 4.5MB
    //   硬上限，平台层直接拒、响应不是 JSON，前端只剩 `Failed with status 413`。
    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(mockImageUpload.handleFileChange).toHaveBeenCalledWith(file)
    expect(mockImageUpload.addReferenceImage).not.toHaveBeenCalled()
  })

  it('disables every add path and explains why when the image limit is full', () => {
    mockImageUpload.referenceEntries = Array.from(
      { length: mockImageUpload.maxImages },
      (_, index) => ({ id: `reference-${index}` }),
    )
    mockImageUpload.referenceImages = mockImageUpload.referenceEntries.map(
      ({ id }) => id,
    )

    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    expect(screen.getByRole('button', { name: 'limitReached' })).toBeDisabled()
  })

  it('「素材库」弹正中的挑选框（ui-spec ㉔），多选到剩余格数为止', () => {
    mockImageUpload.referenceEntries = []
    mockImageUpload.referenceImages = []
    render(
      <Toolbar.Root>
        <ReferenceImageChip />
      </Toolbar.Root>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'open-library' }))

    expect(screen.getByRole('dialog')).toHaveAttribute('data-max', '30')
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'CLOSE_PANEL',
      payload: 'refImage',
    })
  })
})
