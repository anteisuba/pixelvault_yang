import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { CHIP_POPOVER } from '@/constants/motion'
import {
  StudioChipBadge,
  StudioChipLookProvider,
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
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

function ToggleChip() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <StudioToolSurface open={open} onOpenChange={setOpen}>
        <StudioToolSurfaceTrigger>比例</StudioToolSurfaceTrigger>
        <StudioToolPopoverContent label="宽高比" size="small">
          <p>面板内容</p>
        </StudioToolPopoverContent>
      </StudioToolSurface>
      <button type="button">外部区域</button>
    </>
  )
}

describe('Studio chip primitives', () => {
  it('keeps the canonical rounded trigger and active classes', () => {
    expect(studioToolTriggerClass).toContain('h-11')
    expect(studioToolTriggerClass).toContain('sm:h-9')
    expect(studioToolTriggerClass).toContain('rounded-full')
    expect(studioToolTriggerClass).toContain('px-3.5')
    expect(studioToolTriggerClass).toContain('font-medium')
    expect(studioToolTriggerClass).toContain('duration-fast')
    expect(studioToolTriggerClass).toContain('ease-standard')
    expect(studioChipActiveClass).toBe(
      'bg-primary/10 text-primary ring-1 ring-primary/30',
    )
  })

  it('renders the shared primary badge with semantic foreground tokens', () => {
    render(<StudioChipBadge title="Badge title">3</StudioChipBadge>)

    const badge = screen.getByText('3')
    expect(badge).toHaveClass('bg-primary')
    expect(badge).toHaveClass('text-primary-foreground')
    expect(badge).toHaveAttribute('title', 'Badge title')
  })
})

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

  it('closes the anchored popover when its trigger is clicked again', async () => {
    render(<ToggleChip />)

    const trigger = screen.getByText('比例')
    fireEvent.click(trigger)
    expect(await screen.findByText('面板内容')).toBeInTheDocument()

    fireEvent.click(trigger)

    await waitFor(() =>
      expect(screen.queryByText('面板内容')).not.toBeInTheDocument(),
    )
  })

  it('closes the anchored popover when a pointer press happens outside', async () => {
    render(<ToggleChip />)

    fireEvent.click(screen.getByText('比例'))
    expect(await screen.findByText('面板内容')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByText('外部区域'))

    await waitFor(() =>
      expect(screen.queryByText('面板内容')).not.toBeInTheDocument(),
    )
  })

  it('opens a bottom drawer with an accessible title on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true)
    mockTouchPrimary(true)
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

describe('chip 弹层 ②「从 chip 放大」', () => {
  function renderOpen(look: 'ghost' | 'outline') {
    return render(
      <StudioChipLookProvider value={look}>
        <StudioToolSurface open>
          <StudioToolSurfaceTrigger>比例</StudioToolSurfaceTrigger>
          <StudioToolPopoverContent
            label="宽高比"
            side="top"
            align="start"
            sideOffset={8}
          >
            <p>面板内容</p>
          </StudioToolPopoverContent>
        </StudioToolSurface>
      </StudioChipLookProvider>,
    )
  }

  it('描边外观：原点落在 chip 中心，起止缩放 / 模糊写在进退场变量上', async () => {
    renderOpen('outline')
    await screen.findByText('面板内容')
    const popover = document.querySelector<HTMLElement>(
      '[data-studio-tool-popover]',
    )!
    // ⚠ 弹层原语带 `duration-*` 却没有过渡属性 —— 不关会「打开后闪一下」。
    expect(popover).toHaveClass('transition-none')
    expect(popover.style.transformOrigin).toContain(
      'var(--radix-popper-anchor-width) / 2',
    )
    expect(popover.style.transformOrigin).toContain('100% + 8px')
    expect(popover.style.getPropertyValue('--tw-enter-scale')).toBe(
      String(CHIP_POPOVER.fromScale),
    )
    expect(popover.style.getPropertyValue('--tw-exit-blur')).toBe(
      `${CHIP_POPOVER.blurPx}px`,
    )
  })

  it('幽灵外观原样，⛔ 不接放大', async () => {
    renderOpen('ghost')
    await screen.findByText('面板内容')
    const popover = document.querySelector<HTMLElement>(
      '[data-studio-tool-popover]',
    )!
    expect(popover).not.toHaveClass('transition-none')
    expect(popover.style.getPropertyValue('--tw-enter-scale')).toBe('')
  })
})
