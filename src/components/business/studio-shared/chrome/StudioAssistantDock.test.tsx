import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

import { STUDIO_ASSISTANT_DOCK_RESIZE } from '@/constants/studio'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 面板走 next/dynamic 进来。桩件**记录收到的 props** —— 「宿主忘了往下传某个
// 可选 prop」编译器抓不到（可选就是可选），而表现是整个功能静默失效：
// 2026-08-20 `workbenchState` 就是这么在这个 dock 上漏了一整轮的。
// ⚠ 用 spy 记录而不是给外层变量赋值 —— 后者会被 react-hooks/globals 判为
// 「render 期间改外部变量」。spy 调用不是赋值，规则放行，读法也一样直白。
const panelSpy = vi.fn()
vi.mock('next/dynamic', () => ({
  default: () => {
    const Stub: ComponentType<Record<string, unknown>> = (props) => {
      panelSpy(props)
      return <div data-testid="assistant-panel" />
    }
    return Stub
  },
}))
const lastPanelProps = (): Record<string, unknown> =>
  (panelSpy.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  dropTargetForElements: () => () => {},
}))

let mockIsMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))
vi.mock('@/hooks/use-studio-assistant-controls', () => ({
  useStudioAssistantControls: () => ({
    route: { optionId: 'auto', adapterType: 'openai' },
    researchMode: 'forced',
  }),
}))
vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({ uploadFile: vi.fn() }),
}))
vi.mock('@/components/business/assistant/StudioAssistantHeaderActions', () => ({
  StudioAssistantHeaderActions: ({ onClose }: { onClose(): void }) => (
    <button type="button" aria-label="dockCollapse" onClick={onClose} />
  ),
}))

const setOpenMock = vi.fn()
let mockOpen = true
const mockWriteback = {
  prompt: { apply: vi.fn(), isApplied: () => false },
  appendPrompt: vi.fn(),
}
const mockWorkbenchState = {
  prompt: 'a cat',
  modelSelected: true,
  availableModels: [{ id: 'illustrious-xl', label: 'Illustrious XL' }],
}
const mockInjectedReference = {
  url: 'https://cdn.example.com/run-1.png',
  token: 3,
}
vi.mock('@/hooks/use-studio-assistant-panel-inputs', () => ({
  useStudioAssistantPanelInputs: () => ({
    open: mockOpen,
    setOpen: setOpenMock,
    currentPrompt: '',
    modelId: undefined,
    llmApiKeys: [],
    referenceImageData: undefined,
    injectedReference: mockInjectedReference,
    workbenchState: mockWorkbenchState,
    writeback: mockWriteback,
  }),
}))
vi.mock('@/hooks/use-studio-assistant-reference', () => ({
  useStudioAssistantReference: () => ({
    injectedReference: mockInjectedReference,
    injectReference: vi.fn(),
  }),
}))

import { StudioAssistantDock } from './StudioAssistantDock'

beforeEach(() => {
  mockIsMobile = false
  mockOpen = true
  panelSpy.mockClear()
  setOpenMock.mockClear()
  window.localStorage.clear()
})

describe('StudioAssistantDock', () => {
  // ── §3.0b：宿主必须把工作台状态和写回口都往下传 ────────────────────
  //
  // ⚠ 这条测试存在的理由很具体：`workbenchState` 是**可选** prop，这个 dock 漏传
  // 了它，tsc 全绿、eslint 全绿、所有单测全绿，而助手在整个桌面图片工作台上
  // 完全看不见左边的状态（2026-08-20 真机抓到，请求体里连这个键都没有）。
  // 可选 prop 的漏传只能靠断言「确实传了」来挡。
  it('forwards the workbench state and the write-back adapter to the panel', () => {
    render(<StudioAssistantDock />)

    const props = lastPanelProps()
    expect(props.workbenchState).toBe(mockWorkbenchState)
    expect(props.writeback).toBe(mockWriteback)
  })

  // ── §3.0b 第 4 条：结果图上的「问助手」注入的附件必须到得了面板 ──────
  //
  // ⚠ 同一类可选 prop 陷阱：注入通道是模块 store，按钮在 StudioCanvas 深处、
  // 面板在这个 dock 里，中间没有编译期约束。宿主不把 `injectedReference` 往下
  // 传，表现就是「点了问助手，助手输入区里什么都没有」。
  it('forwards the injected media reference to the panel', () => {
    render(<StudioAssistantDock />)

    expect(lastPanelProps().injectedReference).toBe(mockInjectedReference)
  })

  // ⚠ `researchMode` 是第三个同形态的可选 prop：不传 = 面板落到默认 `auto`，
  // 用户在共享头部拨到「关闭」，请求体里照样是 auto —— 表现是「联网关不掉」。
  it('forwards the shared research mode to the panel', () => {
    render(<StudioAssistantDock />)

    expect(lastPanelProps().researchMode).toBe('forced')
  })

  it('renders collapsed to zero width and inert when the panel is closed', () => {
    mockOpen = false
    const { container } = render(<StudioAssistantDock />)

    // The <aside> frame stays mounted (closed = zero width + inert) so the
    // width transition has something to animate from on reopen — it no
    // longer unmounts outright. `inert` removes it from accessibility
    // queries entirely (even with `hidden: true`), so this asserts on the
    // raw DOM instead of screen.getByRole. See
    // docs/references/pages/assistant-shell.md.
    const dock = container.querySelector('aside[aria-label="dockLabel"]')
    expect(dock).toHaveStyle({ width: '0px' })
    expect(dock).toHaveAttribute('inert')
    // The heavy panel chunk stays lazy until the dock has been opened once.
    expect(screen.queryByTestId('assistant-panel')).not.toBeInTheDocument()
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

  it('overlays the desktop workspace instead of consuming layout width', () => {
    render(<StudioAssistantDock />)

    const dock = screen.getByRole('complementary', { name: 'dockLabel' })
    // top/right/bottom 从 -4 改成 -6（owner 2026-09-03 工作台脊柱）：舞台内缩
    // 18px 变成白卡（`.workbench-card`）之后，浮层贴视口边会压住卡片圆角。
    expect(dock).toHaveClass(
      'fixed',
      'bottom-6',
      'right-6',
      'top-6',
      'z-40',
      'rounded-xl',
    )
    expect(dock).not.toHaveClass('shrink-0', 'lg:sticky')
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
