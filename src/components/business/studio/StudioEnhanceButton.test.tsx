import type { ComponentType, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────
//
// 这颗丸自 2026-09-06 起只在**音频档的手机**上还是面板宿主（旧
// `PromptAssistantPanel` 的 ResponsiveDialog 抽屉）；图片 / 视频档桌面与手机
// 都只是开关 —— 面板归 `StudioOperatorDock`（桌面 aside / 手机全屏 Sheet）。
// 所以下面的宿主用例一律把 `outputType` 设成 `audio`，另有一条钉「操作员档的
// 手机上这里不再渲染任何面板」。

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
  useStudioForm: () => ({ state: { outputType: mockOutputType } }),
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
// ⚠ 默认 `audio`：只有音频档还留着这里的抽屉宿主。
let mockOutputType = 'audio'
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
  mockOutputType = 'audio'
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

  // ⚠ 回归闸：图片 / 视频档的手机入口已从旧抽屉切到 `StudioOperatorDock` 的全屏
  // Sheet（⛔ 不留 fallback）。这里再渲染一次旧面板 = 手机上两个助手同屏，
  // 而且点开的是**另一套**东西。
  it.each(['image', 'video'])(
    '操作员档（%s）的手机上只剩开关，⛔ 不再有旧抽屉',
    (outputType) => {
      mockIsMobile = true
      mockOutputType = outputType
      render(<StudioEnhanceButton />)

      expect(screen.queryByTestId('assistant-panel')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'enhance' }),
      ).toBeInTheDocument()
    },
  )
})
