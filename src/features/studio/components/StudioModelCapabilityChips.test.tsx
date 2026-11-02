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
  /** 主模型之后的其余模型（这一轮多选）。 */
  extraModels: [] as { adapterType: string; modelId: string }[],
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
vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({
    runModels: mocks.modelId
      ? [
          { adapterType: mocks.adapterType, modelId: mocks.modelId },
          ...mocks.extraModels,
        ]
      : [],
  }),
}))
vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: (_t: unknown, modelId: string) => modelId,
}))

import { StudioModelCapabilityChips } from './StudioModelCapabilityChips'

// 专属那颗 chip 的弹层是 Radix Popover，jsdom 没有 ResizeObserver。
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('StudioModelCapabilityChips', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    mocks.dispatch.mockClear()
    mocks.adapterType = AI_ADAPTER_TYPES.OPENAI
    mocks.modelId = AI_MODELS.OPENAI_GPT_IMAGE_2
    mocks.advancedParams = {}
    mocks.referenceImages = []
    mocks.extraModels = []
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

  it('shows reference strength only after a reference image is attached', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.FAL
    mocks.modelId = AI_MODELS.FLUX_LORA
    const { rerender } = render(<StudioModelCapabilityChips />)
    expect(
      screen.queryByRole('button', { name: 'capability.referenceStrength' }),
    ).not.toBeInTheDocument()
    mocks.referenceImages = ['https://example.com/a.png']
    rerender(<StudioModelCapabilityChips />)
    expect(
      screen.getByRole('button', { name: 'capability.referenceStrength' }),
    ).toBeEnabled()
  })

  // owner 2026-09-26「不只 GPT 有，其他模型也有」：多选时列的是这一轮所有模型的
  // 并集，⛔ 不只看主模型；只有部分模型认的那一项注明只对谁生效。
  it('lists every run model’s capabilities, not only the primary’s', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.VOLCENGINE
    mocks.modelId = AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE
    mocks.extraModels = [
      {
        adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
        modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
      },
    ]
    // Seedream 的背景 / 拆图层只在图生图成立 —— 挂一张图它们才出现。
    mocks.referenceImages = ['https://example.com/a.png']
    render(<StudioModelCapabilityChips variant="single" />)
    fireEvent.click(screen.getByRole('button', { name: 'sectionLabel' }))

    // 两个模型都认的引导系数不注；只有 Pro 认的两项注明只对谁生效。
    expect(screen.getByText('capability.background')).toBeInTheDocument()
    expect(
      screen.getByText('capability.layerDecomposition'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('onlyFor')).toHaveLength(2)
  })

  it('shows the chip when only a secondary model has capabilities', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.GEMINI
    mocks.modelId = AI_MODELS.GEMINI_PRO_IMAGE
    mocks.extraModels = [
      {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      },
    ]
    render(<StudioModelCapabilityChips variant="single" />)
    expect(
      screen.getByRole('button', { name: 'sectionLabel' }),
    ).toBeInTheDocument()
  })
})
