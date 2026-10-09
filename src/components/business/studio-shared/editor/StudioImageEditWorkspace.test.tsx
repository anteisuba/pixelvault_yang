import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioImageEditWorkspace } from './StudioImageEditWorkspace'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: { index: number }) =>
    params ? `${key}:${params.index}` : key,
}))

const viewport = vi.hoisted(() => ({ phone: false }))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => viewport.phone,
  useIsTablet: () => false,
}))
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({
    referenceImage: undefined,
    fileInputRef: { current: null },
    isUploading: false,
    openFilePicker: vi.fn(),
  }),
}))
vi.mock('./StudioImageEditStage', () => ({
  StudioImageEditStage: ({ active }: { active: boolean }) => (
    <input data-testid="edit-draft" data-active={active} defaultValue="" />
  ),
}))
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

function renderSlots({
  stage,
  params,
  composer,
}: {
  stage: ReactNode
  params: ReactNode
  composer: ReactNode
}) {
  return (
    <div className="studio-layout-v2" data-testid="shared-workspace">
      <div data-testid="shared-header">Workbench</div>
      {stage}
      <div data-testid="params">{params}</div>
      {composer}
    </div>
  )
}

beforeEach(() => {
  viewport.phone = false
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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
      references={[
        { url: 'https://cdn.example.com/a.png' },
        { url: 'https://cdn.example.com/b.png' },
      ]}
    >
      {renderSlots}
    </StudioImageEditWorkspace>,
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

describe('StudioImageEditWorkspace slots', () => {
  const session = {
    target: { url: 'https://cdn.example.com/source.png' },
    sessionId: 1,
    onSelect: vi.fn(),
    onTargetChange: vi.fn(),
    onBack: vi.fn(),
    onChangeSource: vi.fn(),
    onRunStateChange: vi.fn(),
    references: [],
    children: renderSlots,
  }

  it('keeps the edit session and shared header mounted while inactive', () => {
    const view = render(<StudioImageEditWorkspace {...session} active />)
    const header = screen.getByTestId('shared-header')
    const draft = screen.getByTestId('edit-draft')
    const params = screen.getByTestId('params').firstElementChild
    fireEvent.change(draft, { target: { value: 'Keep this edit' } })

    view.rerender(<StudioImageEditWorkspace {...session} active={false} />)
    expect(screen.getByTestId('shared-header')).toBe(header)
    expect(screen.getByTestId('edit-draft')).toBe(draft)
    expect(draft).toHaveValue('Keep this edit')
    expect(draft).toHaveAttribute('data-active', 'false')
    expect(draft.parentElement).toHaveClass('hidden')
    expect(draft.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('params').firstElementChild).toBe(params)
    expect(params).toHaveClass('hidden')

    view.rerender(<StudioImageEditWorkspace {...session} active />)
    expect(screen.getByTestId('shared-header')).toBe(header)
    expect(screen.getByTestId('edit-draft')).toBe(draft)
    expect(draft).toHaveValue('Keep this edit')
    expect(draft.parentElement).toHaveClass('flex')
    expect(params).not.toHaveClass('hidden')

    view.rerender(
      <StudioImageEditWorkspace {...session} active sessionId={2} />,
    )
    expect(screen.getByTestId('edit-draft')).not.toBe(draft)
    expect(screen.getByTestId('edit-draft')).toHaveValue('')
    expect(screen.getByTestId('shared-header')).toBe(header)
  })

  it('does not mount the source picker before editing starts', () => {
    render(
      <StudioImageEditWorkspace {...session} active={false} target={null} />,
    )
    expect(screen.getByTestId('shared-header')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'chooseSource' })).toBeNull()
    expect(screen.queryByTestId('edit-draft')).toBeNull()
    expect(screen.getByTestId('params')).toBeEmptyDOMElement()
  })

  it('retains one mobile composer and updates its height only while active', () => {
    viewport.phone = true
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe
        disconnect = disconnect
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 390, 128),
    )

    const view = render(<StudioImageEditWorkspace {...session} active />)
    const workspace = screen.getByTestId('shared-workspace')
    const composer = workspace.querySelector('.studio-mobile-composer')
    expect(workspace.querySelectorAll('.studio-mobile-composer')).toHaveLength(
      1,
    )
    expect(screen.getByTestId('params')).toBeEmptyDOMElement()
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('128px')
    expect(observe).toHaveBeenCalledWith(composer)

    view.rerender(<StudioImageEditWorkspace {...session} active={false} />)
    expect(workspace.querySelector('.studio-mobile-composer')).toBe(composer)
    expect(composer).toHaveClass('hidden')
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('')
    expect(disconnect).toHaveBeenCalledOnce()

    view.rerender(<StudioImageEditWorkspace {...session} active />)
    expect(workspace.querySelector('.studio-mobile-composer')).toBe(composer)
    expect(composer).not.toHaveClass('hidden')
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('128px')
    expect(workspace.querySelectorAll('.studio-mobile-composer')).toHaveLength(
      1,
    )
  })
})
