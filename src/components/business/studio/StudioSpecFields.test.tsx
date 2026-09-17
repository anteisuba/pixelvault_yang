import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  modelId: 'gpt-image-2.5-sunburst',
  adapterType: 'openai' as string,
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      aspectRatio: '1:1',
      imageBatchCount: 1,
      advancedParams: { resolution: '2K', seed: 123 },
    },
    dispatch: mocks.dispatch,
  }),
}))
vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    selectedModel: {
      adapterType: mocks.adapterType,
      modelId: mocks.modelId,
    },
  }),
}))

import { StudioSpecFields } from './StudioSpecFields'

describe('image specifications', () => {
  beforeEach(() => {
    mocks.dispatch.mockClear()
    mocks.modelId = 'gpt-image-2.5-sunburst'
    mocks.adapterType = AI_ADAPTER_TYPES.OPENAI
  })
  // 画质 / 背景 / 生成预览是**专属**能力，2026-09-18 起住在虚线以下的
  // `StudioModelCapabilityChips`（D2 ④）。规格里再出现一份就是两个真相。
  it('keeps model-specific quality, background and preview out of the spec popover', () => {
    render(<StudioSpecFields touch />)
    expect(
      screen.queryByRole('radio', { name: 'qualityOption.max' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: 'backgroundOption.transparent' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('still drives aspect ratio, resolution and batch count', () => {
    render(<StudioSpecFields />)
    fireEvent.click(screen.getByRole('radio', { name: 'resolutionOption.4K' }))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '4K', seed: 123 },
    })
    fireEvent.click(screen.getByRole('radio', { name: '×4' }))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_IMAGE_BATCH_COUNT',
      payload: 4,
    })
  })

  it('renders no resolution group for a model without that capability', () => {
    mocks.adapterType = AI_ADAPTER_TYPES.NOVELAI
    mocks.modelId = 'nai-diffusion-5-full'
    render(<StudioSpecFields />)
    expect(
      screen.queryByRole('radio', { name: 'resolutionOption.2K' }),
    ).not.toBeInTheDocument()
  })
})
