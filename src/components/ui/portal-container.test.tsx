import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { PortalContainerProvider } from './portal-container'

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
})

/** 剪辑台的做法：落点是台面里一个带 `.dark` 的空节点。 */
function Host({ withHost }: { readonly withHost: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return (
    <PortalContainerProvider value={withHost ? host : null}>
      <div className="dark" data-testid="host" ref={setHost} />
      <Popover open>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent data-testid="popover">popover</PopoverContent>
      </Popover>
      <DropdownMenu open>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu">menu</DropdownMenuContent>
      </DropdownMenu>
    </PortalContainerProvider>
  )
}

describe('PortalContainerProvider', () => {
  it('给了落点：弹层与菜单传送进那个节点（跟着它的 `.dark` 走）', () => {
    render(<Host withHost />)
    const host = screen.getByTestId('host')
    expect(host).toContainElement(screen.getByTestId('popover'))
    expect(host).toContainElement(screen.getByTestId('menu'))
  })

  it('没给：照旧传送到 body', () => {
    render(<Host withHost={false} />)
    expect(screen.getByTestId('host')).not.toContainElement(
      screen.getByTestId('popover'),
    )
    expect(screen.getByTestId('popover').closest('body')).toBe(document.body)
  })
})
