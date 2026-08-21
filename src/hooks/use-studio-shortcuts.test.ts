import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDispatch = vi.fn()
const mockPush = vi.fn()
const mockState = {
  prompt: '',
  panels: {} as Record<string, boolean>,
}

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: mockState, dispatch: mockDispatch }),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'

/** 在某个元素上派发一次 Cmd/Ctrl+Enter，返回事件（好断言 preventDefault）。 */
function pressGenerateChord(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

let mounted: HTMLElement[] = []

function mount<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el)
  mounted.push(el)
  return el
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState.prompt = ''
  mockState.panels = {}
})

afterEach(() => {
  for (const el of mounted) el.remove()
  mounted = []
})

describe('useStudioShortcuts — Cmd/Ctrl+Enter', () => {
  it('提示词框里按下 → 出图（这条快捷键存在的理由）', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ onGenerate }))

    const promptField = mount(document.createElement('textarea'))
    promptField.id = STUDIO_PROMPT_TEXTAREA_ID
    const event = pressGenerateChord(promptField)

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('页面空白处按下 → 出图', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ onGenerate }))

    pressGenerateChord(mount(document.createElement('div')))

    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  // 2026-08-22 真机：在助手输入框里按 Cmd/Ctrl+Enter 发消息，同一下按键**顺带
  // 真出了一张图**。监听挂在 window 上，而这条分支当时完全不看焦点在哪。
  // 代价不是难看，是花钱 —— 所以这条测试守的是「不该触发」那一侧。
  it('⛔ 助手输入框里按下 → 不出图，且把按键还给那个控件', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ onGenerate }))

    const assistantInput = mount(document.createElement('textarea'))
    const event = pressGenerateChord(assistantInput)

    expect(onGenerate).not.toHaveBeenCalled()
    // 不 preventDefault：助手的输入框要靠这下按键把消息发出去。
    expect(event.defaultPrevented).toBe(false)
  })

  it('⛔ 普通 input 里按下 → 不出图（重命名框、标签输入同族）', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ onGenerate }))

    pressGenerateChord(mount(document.createElement('input')))

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('⛔ contenteditable 里按下 → 不出图', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ onGenerate }))

    const editable = mount(document.createElement('div'))
    // jsdom 不按 contenteditable 属性推导 isContentEditable，显式定义。
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    pressGenerateChord(editable)

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('enabled:false 时整套快捷键都不挂', () => {
    const onGenerate = vi.fn()
    renderHook(() => useStudioShortcuts({ enabled: false, onGenerate }))

    const promptField = mount(document.createElement('textarea'))
    promptField.id = STUDIO_PROMPT_TEXTAREA_ID
    pressGenerateChord(promptField)

    expect(onGenerate).not.toHaveBeenCalled()
  })
})
