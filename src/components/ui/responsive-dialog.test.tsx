import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithApp } from '@/test/app-harness'
import { MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from './responsive-dialog'

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
})

beforeEach(() => {
  setViewportWidth(MOBILE_WIDTH, { touch: true })
})

afterEach(() => vi.unstubAllGlobals())

describe('ResponsiveDialog', () => {
  it('allows mobile drawer body chrome to be overridden for full-bleed surfaces', async () => {
    renderWithApp(
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
