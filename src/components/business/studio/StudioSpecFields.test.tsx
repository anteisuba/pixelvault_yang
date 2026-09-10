import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  modelId: 'gpt-image-2.5-sunburst',
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
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: mocks.modelId,
    },
  }),
}))

import { StudioSpecFields } from './StudioSpecFields'

describe('image specifications', () => {
  beforeEach(() => {
    mocks.dispatch.mockClear()
    mocks.modelId = 'gpt-image-2.5-sunburst'
  })
  it('sets maximum quality without replacing the selected resolution or seed', () => {
    render(<StudioSpecFields touch />)
    fireEvent.click(screen.getByRole('radio', { name: 'qualityOption.max' }))
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K', seed: 123, quality: 'max' },
    })
  })
  it('exposes transparent backgrounds and explicitly enabled previews', () => {
    render(<StudioSpecFields />)
    fireEvent.click(
      screen.getByRole('radio', { name: 'backgroundOption.transparent' }),
    )
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K', seed: 123, background: 'transparent' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K', seed: 123, preview: true },
    })
  })
  it('does not show unsupported maximum quality on GPT Image 2', () => {
    mocks.modelId = 'gpt-image-2'
    render(<StudioSpecFields />)
    expect(
      screen.queryByRole('radio', { name: 'qualityOption.max' }),
    ).not.toBeInTheDocument()
  })
})
