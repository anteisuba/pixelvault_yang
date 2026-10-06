import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

import type { StudioModelOption } from '@/types/model-option'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

// Capture the props the wrapper hands to the shared two-step picker so we can
// assert the value mapping and drive its onChange callback.
type CapturedPickerProps = {
  modality: string
  llmCapability?: string
  value: string | null
  onChange: (option: StudioModelOption) => void
  triggerEmptyLabel?: string
  popoverSide?: 'top' | 'bottom'
}
let pickerProps: CapturedPickerProps | null = null

vi.mock('@/components/business/studio-shared/pickers', () => ({
  MainModelPicker: (props: CapturedPickerProps) => {
    pickerProps = props
    return <div data-testid="picker" data-value={String(props.value)} />
  },
}))

import { CanvasAssistantRouteSelector } from './CanvasAssistantRouteSelector'

function makeOption(over: Partial<StudioModelOption>): StudioModelOption {
  return {
    optionId: over.optionId ?? 'opt',
    modelId: over.modelId ?? 'model-id',
    adapterType: over.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    providerConfig: { label: 'P', baseUrl: '' },
    requestCount: 0,
    isBuiltIn: false,
    sourceType: 'saved',
    ...over,
  } as StudioModelOption
}

describe('CanvasAssistantRouteSelector', () => {
  it('drives the two-step llm_assist picker scoped to the assistant capability', () => {
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.modality).toBe('llm_assist')
    expect(pickerProps?.llmCapability).toBe('assistant')
  })

  it('opens the header model picker below its trigger', () => {
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={vi.fn()}
      />,
    )

    expect(pickerProps?.popoverSide).toBe('bottom')
  })

  it('passes value=null when no key is selected, and the key route otherwise', () => {
    const { rerender } = render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.value).toBeNull()

    rerender(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'x',
          apiKeyId: 'k1',
          adapterType: AI_ADAPTER_TYPES.GEMINI,
          modelId: 'gemini-3.8-flash',
        }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.value).toBe(
      'llm-route:assistant:key:k1:gemini-3.8-flash',
    )
  })

  it('legacy selection without modelId matches no option (renders empty label)', () => {
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'x',
          apiKeyId: 'k1',
          adapterType: AI_ADAPTER_TYPES.GEMINI,
        }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.value).toBeNull()
  })

  // ⚠ 2026-08-19 生产事故的回归位：组件**曾经写死**画布的默认路由标签
  // （OpenAI GPT-6.1 Sol）。studio 复用它时没有 gateway 分支，服务端按
  // `LLM_TEXT_ADAPTERS` 兜底到 Gemini —— 界面报 GPT、实际打 Gemini，
  // Gemini 空回复时 owner 完全无法归因。**默认路由是调用方的事实，不是组件的。**
  it('未选 BYOK 路由时透传调用方给的标签，不自己写死任何型号', () => {
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="调用方说了算"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.triggerEmptyLabel).toBe('调用方说了算')
  })

  it('maps a picked saved key to the NodeAssistantRouteSelection contract', () => {
    const onChange = vi.fn()
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={onChange}
      />,
    )
    pickerProps?.onChange(makeOption({ keyId: 'key-123' }))
    expect(onChange).toHaveBeenCalledWith({
      optionId: 'node-studio-assistant:key:key-123:model-id',
      apiKeyId: 'key-123',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: 'model-id',
    })
  })

  it('ignores a picked option without a key (locked rows route to setup, not change)', () => {
    const onChange = vi.fn()
    render(
      <CanvasAssistantRouteSelector
        emptyRouteLabel="Auto route"
        value={{
          optionId: 'node-studio-assistant:auto',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
        }}
        onChange={onChange}
      />,
    )
    pickerProps?.onChange(makeOption({ keyId: undefined }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
