import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

// Capture the props the wrapper hands to the shared two-step picker so we can
// assert the value mapping and drive its onChange / onRequestSetup callbacks.
type CapturedPickerProps = {
  modality: string
  llmCapability?: string
  value: string | null
  onChange: (option: StudioModelOption) => void
  onRequestSetup?: (option: StudioModelOption) => void
}
let pickerProps: CapturedPickerProps | null = null

vi.mock('@/components/business/studio-shared/pickers', () => ({
  MainModelPicker: (props: CapturedPickerProps) => {
    pickerProps = props
    return <div data-testid="picker" data-value={String(props.value)} />
  },
}))

type CapturedQuickSetupProps = {
  open: boolean
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
}
let quickSetupProps: CapturedQuickSetupProps | null = null

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: (props: CapturedQuickSetupProps) => {
    quickSetupProps = props
    return (
      <div
        data-testid="quick-setup"
        data-open={String(props.open)}
        data-label={props.modelLabel}
        data-adapter={props.adapterType}
      />
    )
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
    freeTier: false,
    sourceType: 'saved',
    ...over,
  } as StudioModelOption
}

describe('CanvasAssistantRouteSelector', () => {
  it('drives the two-step llm_assist picker scoped to the assistant capability', () => {
    render(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'node-studio-assistant:auto' }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.modality).toBe('llm_assist')
    expect(pickerProps?.llmCapability).toBe('assistant')
  })

  it('passes value=null when no key is selected, and the key route otherwise', () => {
    const { rerender } = render(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'node-studio-assistant:auto' }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.value).toBeNull()

    rerender(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'x', apiKeyId: 'k1' }}
        onChange={vi.fn()}
      />,
    )
    expect(pickerProps?.value).toBe('llm-route:assistant:key:k1')
  })

  it('maps a picked saved key to the NodeAssistantRouteSelection contract', () => {
    const onChange = vi.fn()
    render(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'node-studio-assistant:auto' }}
        onChange={onChange}
      />,
    )
    pickerProps?.onChange(makeOption({ keyId: 'key-123' }))
    expect(onChange).toHaveBeenCalledWith({
      optionId: 'node-studio-assistant:key:key-123',
      apiKeyId: 'key-123',
    })
  })

  it('ignores a picked option without a key (locked rows route to setup, not change)', () => {
    const onChange = vi.fn()
    render(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'node-studio-assistant:auto' }}
        onChange={onChange}
      />,
    )
    pickerProps?.onChange(makeOption({ keyId: undefined }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens QuickSetup for a needs-key provider with the adapter-matched label', () => {
    render(
      <CanvasAssistantRouteSelector
        value={{ optionId: 'node-studio-assistant:auto' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('quick-setup').dataset.open).toBe('false')

    act(() => {
      pickerProps?.onRequestSetup?.(
        makeOption({
          adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
          optionId: 'llm-route:assistant:setup:qwen3-max',
          modelId: 'qwen3-max',
        }),
      )
    })
    expect(quickSetupProps?.open).toBe(true)
    expect(quickSetupProps?.adapterType).toBe(AI_ADAPTER_TYPES.DASHSCOPE)
    // Adapter → setup label key (getSetupLabelKey maps DashScope → setupQwen).
    expect(quickSetupProps?.modelLabel).toBe(
      'StudioNode.assistantRoute.setupQwen',
    )
  })
})
