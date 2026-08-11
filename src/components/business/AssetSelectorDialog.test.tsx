import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIsMobile } from '@/hooks/use-mobile'
import { AssetSelectorDialog } from './AssetSelectorDialog'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

// picker 现在是自己的任务型 shell（page §8），不再复用整个素材页组件。
vi.mock('@/components/business/assets/AssetPickerBrowser', () => ({
  AssetPickerBrowser: ({
    mediaType,
    mode,
  }: {
    mediaType?: string
    mode?: string
  }) => (
    <div
      data-testid="asset-browser"
      data-media-type={mediaType}
      data-mode={mode}
    />
  ),
}))

const mockUseIsMobile = vi.mocked(useIsMobile)

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }
})

beforeEach(() => {
  mockUseIsMobile.mockReturnValue(false)
})

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <AssetSelectorDialog
      open
      onOpenChange={onOpenChange}
      onSelect={vi.fn()}
      title="Pick asset"
      description="Choose one asset"
      mediaType="image"
    />,
  )
  return onOpenChange
}

describe('AssetSelectorDialog', () => {
  it('keeps the desktop surface on the dialog path', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog).toHaveClass('lg:h-[min(65vh,600px)]')
    expect(screen.getByTestId('asset-browser')).toHaveAttribute(
      'data-media-type',
      'image',
    )
  })

  it('uses the mobile drawer sheet with full-bleed body chrome', () => {
    mockUseIsMobile.mockReturnValue(true)
    const onOpenChange = renderDialog()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('max-h-[95svh]', 'h-[min(88svh,760px)]')
    expect(
      screen.getByTestId('asset-browser').parentElement?.parentElement,
    ).toHaveClass('px-0', 'pt-0')

    fireEvent.click(screen.getByRole('button', { name: 'Pick asset' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
