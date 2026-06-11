import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { useIsMobile } from '@/hooks/use-mobile'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from './tool-surface'

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
})

function renderChip(open?: boolean) {
  return render(
    <StudioToolSurface open={open}>
      <StudioToolSurfaceTrigger>比例</StudioToolSurfaceTrigger>
      <StudioToolPopoverContent label="宽高比" size="small">
        <p>面板内容</p>
      </StudioToolPopoverContent>
    </StudioToolSurface>,
  )
}

describe('StudioToolSurface', () => {
  it('opens an anchored popover with the tool data attribute on desktop', async () => {
    renderChip()

    expect(screen.queryByText('面板内容')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('比例'))

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    const popover = document.querySelector('[data-studio-tool-popover]')
    expect(popover).not.toBeNull()
    expect(popover).toHaveAttribute('aria-label', '宽高比')
  })

  it('opens a bottom drawer with an accessible title on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true)
    renderChip(true)

    expect(await screen.findByText('面板内容')).toBeInTheDocument()
    // vaul 抽屉是 Radix dialog；sr-only 标题提供可访问名。
    expect(screen.getByText('宽高比')).toBeInTheDocument()
    expect(document.querySelector('[data-studio-tool-popover]')).toBeNull()
  })

  it('keeps legacy bare-Popover hosts on the popover path even on mobile', async () => {
    // 过渡期安全属性：尚未迁到 StudioToolSurface 根的旧宿主（裸 Popover 根）
    // 不受响应式内容影响 —— 没有响应式上下文时永远走桌面 popover 分支。
    mockUseIsMobile.mockReturnValue(true)
    render(
      <Popover open>
        <PopoverTrigger>旧chip</PopoverTrigger>
        <StudioToolPopoverContent label="旧面板">
          <p>旧内容</p>
        </StudioToolPopoverContent>
      </Popover>,
    )

    expect(await screen.findByText('旧内容')).toBeInTheDocument()
    expect(document.querySelector('[data-studio-tool-popover]')).not.toBeNull()
  })
})
