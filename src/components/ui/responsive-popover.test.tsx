import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from './responsive-popover'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

const mockUseIsMobile = vi.mocked(useIsMobile)

beforeAll(() => {
  // jsdom lacks the observers Radix/floating-ui and vaul rely on.
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
  mockTouchPrimary(false)
})

function mockTouchPrimary(isTouch: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(hover: none)' ? isTouch : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

function renderSubject(open?: boolean) {
  return render(
    <ResponsivePopover open={open}>
      <ResponsivePopoverTrigger>打开设置</ResponsivePopoverTrigger>
      <ResponsivePopoverContent label="快速设置">
        <p>面板内容</p>
      </ResponsivePopoverContent>
    </ResponsivePopover>,
  )
}

function ToggleSubject() {
  const [open, setOpen] = useState(false)

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger>打开设置</ResponsivePopoverTrigger>
      <ResponsivePopoverContent label="快速设置">
        <p>面板内容</p>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}

describe('ResponsivePopover', () => {
  it('renders a Popover on desktop and opens from the trigger', async () => {
    renderSubject()

    expect(screen.queryByText('面板内容')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('打开设置'))

    const content = await screen.findByText('面板内容')
    expect(content).toBeInTheDocument()
    const popover = document.querySelector('[data-slot="popover-content"]')
    expect(popover).not.toBeNull()
    expect(popover).toHaveAttribute('aria-label', '快速设置')
  })

  it('renders a Drawer with an accessible title on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true)
    mockTouchPrimary(true)
    renderSubject(true)

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    // vaul renders a Radix dialog under the hood; our sr-only DrawerTitle
    // must be present so the dialog has an accessible name.
    expect(screen.getByText('快速设置')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
  })

  it('keeps a compact fine-pointer viewport on the anchored popover path so the trigger can close it', async () => {
    mockUseIsMobile.mockReturnValue(true)
    mockTouchPrimary(false)
    render(<ToggleSubject />)

    const trigger = screen.getByText('打开设置')
    fireEvent.click(trigger)

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeNull()

    fireEvent.click(trigger)

    await waitFor(() =>
      expect(screen.queryByText('面板内容')).not.toBeInTheDocument(),
    )
  })
})
