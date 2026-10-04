import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StudioImageEditWorkspace } from './StudioImageEditWorkspace'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: { index: number }) =>
    params ? `${key}:${params.index}` : key,
}))

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({
    referenceImage: undefined,
    fileInputRef: { current: null },
    isUploading: false,
    openFilePicker: vi.fn(),
  }),
}))
vi.mock(
  '@/components/business/studio-shared/chrome/StudioWorkbenchLayout',
  () => ({
    StudioWorkbenchLayout: ({
      header,
      stage,
      params,
    }: {
      header: ReactNode
      stage: ReactNode
      params: ReactNode
    }) => (
      <>
        {header}
        {stage}
        {params}
      </>
    ),
  }),
)
vi.mock('./StudioImageEditStage', () => ({ StudioImageEditStage: () => null }))
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    mediaType,
    onSelect,
  }: {
    open: boolean
    mediaType: string
    onSelect: (generation: { url: string; id: string }) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="assets" data-media-type={mediaType}>
        {mediaType === 'image' ? (
          <button
            type="button"
            onClick={() =>
              onSelect({
                url: 'https://cdn.example.com/selected.png',
                id: 'asset-1',
              })
            }
          >
            Choose saved image
          </button>
        ) : null}
      </div>
    ) : null,
}))

function renderPicker() {
  const onSelect = vi.fn()
  render(
    <StudioImageEditWorkspace
      active
      target={null}
      sessionId={0}
      onSelect={onSelect}
      onTargetChange={vi.fn()}
      onBack={vi.fn()}
      onChangeSource={vi.fn()}
      onRunStateChange={vi.fn()}
      header={null}
      references={[
        { url: 'https://cdn.example.com/a.png' },
        { url: 'https://cdn.example.com/b.png' },
      ]}
    />,
  )
  return onSelect
}

describe('StudioImageEditWorkspace source picker', () => {
  it('opens the asset library with its lowercase image media contract and binds the chosen asset', () => {
    const onSelect = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'chooseSource' }))
    expect(screen.getByRole('dialog', { name: 'assets' })).toHaveAttribute(
      'data-media-type',
      'image',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose saved image' }))
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/selected.png',
      generationId: 'asset-1',
    })
  })

  it('binds the explicitly chosen reference slot instead of selecting the first image', () => {
    const onSelect = renderPicker()
    fireEvent.click(
      screen.getByRole('button', { name: 'stageEditingReference:2' }),
    )
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/b.png',
      referenceIndex: 1,
      referenceTotal: 2,
    })
  })
})
