import type { ComponentType, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────
//
// 这个宿主是**移动端**的面板宿主（<lg 走抽屉，≥lg 只是个开关，面板在
// StudioAssistantDock 里）。测试只关心一件事：它有没有把面板需要的 props 都
// 往下传 —— 见下方注释里的可选 prop 陷阱。

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 面板走 next/dynamic 进来。桩件**记录收到的 props**（与 StudioAssistantDock
// 的测试同款）：可选 prop 漏传编译器抓不到，只能靠断言「确实传了」来挡。
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

vi.mock('@radix-ui/react-toolbar', () => ({
  Button: (props: Record<string, unknown>) => (
    <button {...(props as Record<string, never>)} />
  ),
}))

vi.mock('@/components/ui/responsive-dialog', () => ({
  ResponsiveDialog: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  studioChipActiveClass: 'chip-active',
  studioDialogBaseClass: 'dialog-base',
  studioToolTriggerClass: 'tool-trigger',
  StudioPanelHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/business/assistant/StudioAssistantHeaderActions', () => ({
  StudioAssistantHeaderActions: () => null,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioData: () => ({ promptEnhance: { isEnhancing: false } }),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

vi.mock('@/hooks/use-studio-assistant-controls', () => ({
  useStudioAssistantControls: () => ({
    route: { optionId: 'auto', adapterType: 'openai' },
    researchMode: 'forced',
  }),
}))

let mockIsMobile = true
const mockWriteback = {
  prompt: { apply: vi.fn(), isApplied: () => false },
}
const mockWorkbenchState = { prompt: 'a cat', modelSelected: true }
const mockInjectedReference = {
  url: 'https://cdn.example.com/run-9.png',
  token: 4,
}
vi.mock('@/hooks/use-studio-assistant-panel-inputs', () => ({
  useStudioAssistantPanelInputs: () => ({
    open: true,
    setOpen: vi.fn(),
    currentPrompt: '',
    modelId: undefined,
    assistantDomain: 'image' as const,
    llmApiKeys: [],
    referenceImageData: undefined,
    injectedReference: mockInjectedReference,
    workbenchState: mockWorkbenchState,
    writeback: mockWriteback,
  }),
}))

import { StudioEnhanceButton } from './StudioEnhanceButton'

beforeEach(() => {
  mockIsMobile = true
  panelSpy.mockClear()
})

describe('StudioEnhanceButton', () => {
  // ── §3.0b 第 4 条：「问助手」在移动端也要能把结果图送进面板 ──────────
  //
  // ⚠ 这条测试有具体的翻车原型：`workbenchState` 曾经在**桌面** dock 上漏传了
  // 一整轮，tsc / eslint / 全量单测三绿而功能全失效（可选 prop 就是可选）。
  // `injectedReference` 是同一形态的第二个：桌面 dock 传了、这个移动端宿主原来
  // 根本没有这一行，表现是「移动端点了问助手，输入区里什么都没出现」。
  // 一个面板 N 个宿主，验一个 ≠ 验全部。
  it('forwards the injected media reference, workbench state and write-back adapter to the panel', () => {
    render(<StudioEnhanceButton />)

    const props = lastPanelProps()
    expect(props.injectedReference).toBe(mockInjectedReference)
    expect(props.workbenchState).toBe(mockWorkbenchState)
    expect(props.writeback).toBe(mockWriteback)
  })

  // ⚠ `researchMode` 不传 = 面板落到默认 `auto`，用户在头部拨到「关闭」也关不掉。
  it('forwards the shared research mode to the panel', () => {
    render(<StudioEnhanceButton />)

    expect(lastPanelProps().researchMode).toBe('forced')
  })

  it('renders only the toggle chip on desktop — the dock owns the panel there', () => {
    mockIsMobile = false
    render(<StudioEnhanceButton />)

    expect(screen.queryByTestId('assistant-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'enhance' })).toBeInTheDocument()
  })
})
