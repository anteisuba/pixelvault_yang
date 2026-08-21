import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ComponentType } from 'react'

import type { AssistantWorkbenchState } from '@/types'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 面板走 next/dynamic 进来。桩件**记录收到的 props** —— 「宿主忘了往下传某个
// 可选 prop」编译器抓不到（可选就是可选），而表现是整个功能静默失效：
// 2026-08-20 `workbenchState` 就是这么在姊妹 dock 上漏了一整轮的。
// ⚠ 用 spy 记录而不是给外层变量赋值 —— 后者会被 react-hooks/globals 判为
// 「render 期间改外部变量」。
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

// 宽度记忆（useDockLayout）住在姊妹 dock 的模块里，它自己又 import 了拖放适配器
// 与 studio-context 那条链。本页**故意不挂 <StudioProvider>**，所以这里把那条链
// 掐断：宽度行为由 StudioAssistantDock.test.tsx 覆盖，本文件只验接线。
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  dropTargetForElements: () => () => {},
}))
vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({ uploadFile: vi.fn() }),
}))
vi.mock('@/hooks/use-studio-assistant-panel-inputs', () => ({
  useStudioAssistantPanelInputs: () => {
    throw new Error('useStudioForm must be used within <StudioProvider>')
  },
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))
vi.mock('@/hooks/use-studio-assistant-controls', () => ({
  useStudioAssistantControls: () => ({
    route: { optionId: 'auto', adapterType: 'openai' },
    researchMode: 'forced',
  }),
}))
vi.mock('@/components/business/assistant/StudioAssistantHeaderActions', () => ({
  StudioAssistantHeaderActions: ({ onClose }: { onClose(): void }) => (
    <button type="button" aria-label="dockCollapse" onClick={onClose} />
  ),
}))

const clearReferenceMock = vi.fn()
const mockInjectedReference = {
  url: 'https://cdn.example.com/lora-run-1.png',
  token: 7,
}
vi.mock('@/hooks/use-studio-assistant-reference', () => ({
  useStudioAssistantReference: () => ({
    injectedReference: mockInjectedReference,
    injectReference: vi.fn(),
    clearReference: clearReferenceMock,
  }),
}))

import { LoraAssistantDock } from './LoraAssistantDock'

const workbenchState: AssistantWorkbenchState = {
  prompt: 'a fox in ink wash',
  modelSelected: true,
  output: { aspectRatio: '1:1' },
  referenceImageCount: 0,
}

const persona = {
  mounts: [],
  trayTags: [],
  onAppendPrompt: vi.fn(),
  onUseNegativePrompt: vi.fn(),
  onAppendNegativePrompt: vi.fn(),
  onEscapeToSelfBuild: vi.fn(),
}

function renderDock(open: boolean) {
  return render(
    <LoraAssistantDock
      open={open}
      onOpenChange={vi.fn()}
      currentPrompt="a fox in ink wash"
      llmApiKeys={[]}
      onUsePrompt={vi.fn()}
      persona={persona}
      workbenchState={workbenchState}
    />,
  )
}

beforeEach(() => {
  panelSpy.mockClear()
  clearReferenceMock.mockClear()
  window.localStorage.clear()
})

describe('LoraAssistantDock', () => {
  // ── §3.0b 第 4 条：结果图上的「问助手」注入的附件必须到得了面板 ──────
  //
  // ⚠ 这条测试存在的理由很具体：`injectedReference` 是**可选** prop，注入通道
  // 又是模块 store —— 按钮在 GenerateBranch 深处、面板在这个 dock 里，中间没有
  // 任何编译期约束。宿主不把它往下传，tsc / eslint / 其余单测全绿，表现只是
  // 「点了问助手，助手输入区里什么都没有」。姊妹 dock 上 `workbenchState`
  // 就是这么漏了一整轮的（2026-08-20 真机抓到）。
  it('forwards the injected media reference to the panel', () => {
    renderDock(true)

    expect(lastPanelProps().injectedReference).toBe(mockInjectedReference)
  })

  it('forwards the workbench state and the lora persona to the panel', () => {
    renderDock(true)

    const props = lastPanelProps()
    expect(props.workbenchState).toBe(workbenchState)
    expect(props.loraPersona).toBe(persona)
    expect(props.assistantDomain).toBe('lora')
  })

  // ── 检索三态：开关状态住在共享 controls store，宿主负责往面板传 ────────
  //
  // ⚠ 同一类可选 prop 陷阱：`researchMode` 不传，面板会落到自己的默认值
  // `auto` —— 用户在头部拨到「关闭」，请求体里照样是 auto，表现是「关不掉」。
  // 三个宿主各验一次：一个面板 N 个宿主，验一个 ≠ 验全部。
  it('forwards the shared research mode to the panel', () => {
    renderDock(true)

    expect(lastPanelProps().researchMode).toBe('forced')
  })

  // 一次注入只属于一次打开：关掉助手就把待注入的图丢掉，否则移动端 Drawer
  // 重开时旧引用会被当成一次新注入再挂一次（用户没点，附件却在那儿）。
  it('drops the pending injection when the assistant is closed', () => {
    renderDock(false)

    expect(clearReferenceMock).toHaveBeenCalled()
  })

  it('keeps the pending injection while the assistant is open', () => {
    renderDock(true)

    expect(clearReferenceMock).not.toHaveBeenCalled()
  })
})
