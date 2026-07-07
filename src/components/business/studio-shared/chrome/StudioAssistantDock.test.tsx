import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

import { STUDIO_ASSISTANT_DOCK_RESIZE } from '@/constants/studio'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/dynamic', () => ({
  default: () => {
    const Stub: ComponentType = () => <div data-testid="assistant-panel" />
    return Stub
  },
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  dropTargetForElements: () => () => {},
}))

let mockIsMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

const setOpenMock = vi.fn()
let mockOpen = true
vi.mock('@/hooks/use-studio-assistant-panel-inputs', () => ({
  useStudioAssistantPanelInputs: () => ({
    open: mockOpen,
    setOpen: setOpenMock,
    currentPrompt: '',
    modelId: undefined,
    llmApiKeys: [],
    referenceImageData: undefined,
    onUsePrompt: vi.fn(),
    onAppendPrompt: vi.fn(),
  }),
}))

import { StudioAssistantDock } from './StudioAssistantDock'

beforeEach(() => {
  mockIsMobile = false
  mockOpen = true
  setOpenMock.mockClear()
  window.localStorage.clear()
})

describe('StudioAssistantDock', () => {
  it('renders nothing when the panel is closed', () => {
    mockOpen = false
    const { container } = render(<StudioAssistantDock />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on mobile — the drawer host owns <lg', () => {
    mockIsMobile = true
    const { container } = render(<StudioAssistantDock />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a complementary landmark at the default width when open', () => {
    render(<StudioAssistantDock />)

    const dock = screen.getByRole('complementary', { name: 'dockLabel' })
    expect(dock).toHaveStyle({
      width: `${STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx}px`,
    })
    expect(screen.getByTestId('assistant-panel')).toBeInTheDocument()
  })

  it('exposes an accessible resize separator with clamped bounds', () => {
    render(<StudioAssistantDock />)

    const separator = screen.getByRole('separator', {
      name: 'dockResizeLabel',
    })
    expect(separator).toHaveAttribute(
      'aria-valuemin',
      String(STUDIO_ASSISTANT_DOCK_RESIZE.minWidthPx),
    )
    expect(separator).toHaveAttribute(
      'aria-valuemax',
      String(STUDIO_ASSISTANT_DOCK_RESIZE.maxWidthPx),
    )
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx),
    )
  })

  it('keyboard-resizes in widthStep increments and persists to localStorage', () => {
    render(<StudioAssistantDock />)

    const separator = screen.getByRole('separator', {
      name: 'dockResizeLabel',
    })
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })

    const widened =
      STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx +
      STUDIO_ASSISTANT_DOCK_RESIZE.widthStepPx
    expect(separator).toHaveAttribute('aria-valuenow', String(widened))
    expect(
      JSON.parse(
        window.localStorage.getItem(STUDIO_ASSISTANT_DOCK_RESIZE.storageKey) ??
          '{}',
      ).widthPx,
    ).toBe(widened)

    // 双击手柄复位默认宽
    fireEvent.doubleClick(separator)
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(STUDIO_ASSISTANT_DOCK_RESIZE.defaultWidthPx),
    )
  })

  it('collapses through the header button', () => {
    render(<StudioAssistantDock />)

    fireEvent.click(screen.getByRole('button', { name: 'dockCollapse' }))
    expect(setOpenMock).toHaveBeenCalledWith(false)
  })
})
