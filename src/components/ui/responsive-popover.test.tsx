import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'

import { renderWithApp } from '@/test/app-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverPhoneCard,
  ResponsivePopoverTrigger,
} from './responsive-popover'

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
})

beforeEach(() => setViewportWidth(DESKTOP_WIDTH))
afterEach(() => vi.unstubAllGlobals())

function renderSubject(open?: boolean) {
  return renderWithApp(
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
    setViewportWidth(MOBILE_WIDTH, { touch: true })
    renderSubject(true)

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    // vaul renders a Radix dialog under the hood; our sr-only DrawerTitle
    // must be present so the dialog has an accessible name.
    expect(screen.getByText('快速设置')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
  })

  it('keeps a compact fine-pointer viewport on the anchored popover path so the trigger can close it', async () => {
    setViewportWidth(MOBILE_WIDTH, { touch: false })
    renderWithApp(<ToggleSubject />)

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

  it('inside a phone-card scope a touch phone still gets the anchored card, capped to the free space', async () => {
    setViewportWidth(MOBILE_WIDTH, { touch: true })
    renderWithApp(
      <ResponsivePopoverPhoneCard>
        <ResponsivePopover open>
          <ResponsivePopoverTrigger>打开设置</ResponsivePopoverTrigger>
          <ResponsivePopoverContent label="快速设置">
            <p>面板内容</p>
          </ResponsivePopoverContent>
        </ResponsivePopover>
      </ResponsivePopoverPhoneCard>,
    )

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    const popover = document.querySelector('[data-slot="popover-content"]')
    expect(popover).not.toBeNull()
    expect(popover?.className).toContain(
      'max-h-(--radix-popover-content-available-height)',
    )
  })
})
