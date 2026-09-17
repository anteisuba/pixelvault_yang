import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  adapterType: 'openai' as string,
  modelId: 'gpt-image-2' as string | undefined,
  advancedParams: {} as Record<string, unknown>,
  referenceImages: [] as string[],
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { advancedParams: mocks.advancedParams },
    dispatch: mocks.dispatch,
  }),
  useStudioData: () => ({
    imageUpload: { referenceImages: mocks.referenceImages },
  }),
}))
vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    selectedModel: mocks.modelId
      ? { adapterType: mocks.adapterType, modelId: mocks.modelId }
      : undefined,
  }),
}))
vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: (_t: unknown, modelId: string) => modelId,
}))

import { StudioModelCapabilityChips } from './StudioModelCapabilityChips'

describe('StudioModelCapabilityChips', () => {
  beforeEach(() => {
    mocks.dispatch.mockClear()
    mocks.adapterType = AI_ADAPTER_TYPES.OPENAI
    mocks.modelId = AI_MODELS.OPENAI_GPT_IMAGE_2
    mocks.advancedParams = {}
    mocks.referenceImages = []
  })

  it('renders one chip per model-specific capability', () => {
    render(<StudioModelCapabilityChips />)
    expect(screen.getByText('sectionLabel')).toBeInTheDocument()
    expect(screen.getByText('capability.quality')).toBeInTheDocument()
    expect(screen.getByText('capability.background')).toBeInTheDocument()
    expect(screen.getByText('capability.style')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  // 没有专属能力 = 整段（虚线 + 小标 + chip 行）不渲染。
  it('renders nothing for a model with no model-specific capability', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.GEMINI
    mocks.modelId = AI_MODELS.GEMINI_PRO_IMAGE
    const { container } = render(<StudioModelCapabilityChips />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing before a model is picked', () => {
    mocks.modelId = undefined
    const { container } = render(<StudioModelCapabilityChips />)
    expect(container).toBeEmptyDOMElement()
  })

  // 选中态把当前取值写进 chip 上；默认态只写能力名。
  it('prints the current value only once the chip leaves its default', () => {
    render(<StudioModelCapabilityChips />)
    expect(screen.getByText('capability.quality')).toBeInTheDocument()
    mocks.advancedParams = { quality: 'high' }
    render(<StudioModelCapabilityChips />)
    expect(
      screen.getByText('capability.quality · qualityOption.high'),
    ).toBeInTheDocument()
  })

  it('toggles a boolean capability in place without opening a popover', () => {
    render(<StudioModelCapabilityChips />)
    fireEvent.click(screen.getByRole('switch'))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { preview: true },
    })
  })

  // 整个对象带过去，只换一个键 —— SET_ADVANCED_PARAMS 是整体替换。
  it('keeps the rest of advancedParams when one chip changes', () => {
    mocks.advancedParams = { resolution: '2K', seed: 7 }
    render(<StudioModelCapabilityChips />)
    fireEvent.click(screen.getByRole('switch'))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K', seed: 7, preview: true },
    })
  })

  // 前置条件没满足 → muted 次要态：画出来但点不动，⛔ 不隐藏。
  it('greys out reference strength until a reference image is attached', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.FAL
    mocks.modelId = AI_MODELS.FLUX_LORA
    const { rerender } = render(<StudioModelCapabilityChips />)
    expect(
      screen.getByRole('button', { name: 'capability.referenceStrength' }),
    ).toBeDisabled()
    mocks.referenceImages = ['https://example.com/a.png']
    rerender(<StudioModelCapabilityChips />)
    expect(
      screen.getByRole('button', { name: 'capability.referenceStrength' }),
    ).toBeEnabled()
  })
})
