import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { useIsMobile } from '@/hooks/use-mobile'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from './responsive-dialog'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => true),
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
  mockUseIsMobile.mockReturnValue(true)
})

describe('ResponsiveDialog', () => {
  it('allows mobile drawer body chrome to be overridden for full-bleed surfaces', async () => {
    render(
      <ResponsiveDialog open>
        <ResponsiveDialogTrigger>Open</ResponsiveDialogTrigger>
        <ResponsiveDialogContent mobileBodyClassName="px-0 pt-0">
          <ResponsiveDialogTitle>Asset picker</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Pick one asset
          </ResponsiveDialogDescription>
          <p>Browser body</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )

    const body = await screen.findByText('Browser body')
    expect(body.parentElement).toHaveClass('px-0', 'pt-0')
  })
})
