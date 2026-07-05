import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { StudioResolutionPopover } from './StudioResolutionPopover'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockState = vi.hoisted(() => ({
  panels: { resolution: false },
  advancedParams: {} as Record<string, unknown>,
}))
const mockSelectedModel = vi.hoisted(() => ({
  value: { adapterType: 'openai', modelId: 'gpt-image-2' } as
    | { adapterType: string; modelId: string }
    | undefined,
}))
const mockCapabilityConfig = vi.hoisted(() => ({
  value: {
    resolutionOptions: ['auto', '1K', '2K', '4K'],
    qualityOptions: ['auto', 'low', 'medium', 'high'],
  } as { resolutionOptions?: string[]; qualityOptions?: string[] },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: mockState,
    dispatch: mockDispatch,
  }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({ selectedModel: mockSelectedModel.value }),
}))

vi.mock('@/constants/provider-capabilities', () => ({
  getCapabilityConfig: () => mockCapabilityConfig.value,
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  StudioToolSurface: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioToolSurfaceTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  StudioToolPopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  studioChipActiveClass: 'studio-chip-active',
  studioToolTriggerClass: '',
}))

describe('StudioResolutionPopover', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    mockState.panels = { resolution: false }
    mockState.advancedParams = {}
    mockSelectedModel.value = { adapterType: 'openai', modelId: 'gpt-image-2' }
    mockCapabilityConfig.value = {
      resolutionOptions: ['auto', '1K', '2K', '4K'],
      qualityOptions: ['auto', 'low', 'medium', 'high'],
    }
  })

  it('renders nothing when the model has neither resolution nor quality capability', () => {
    mockCapabilityConfig.value = {}

    const { container } = render(
      <Toolbar.Root>
        <StudioResolutionPopover />
      </Toolbar.Root>,
    )

    expect(container.querySelector('button')).toBeNull()
  })

  it('dispatches SET_ADVANCED_PARAMS with the picked resolution tier', () => {
    render(
      <Toolbar.Root>
        <StudioResolutionPopover />
      </Toolbar.Root>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'resolutionOption.2K' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K' },
    })
  })

  it('dispatches SET_ADVANCED_PARAMS with the picked quality tier', () => {
    render(
      <Toolbar.Root>
        <StudioResolutionPopover />
      </Toolbar.Root>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'qualityOption.high' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { quality: 'high' },
    })
  })

  it('renders only the resolution section when quality capability is absent', () => {
    mockCapabilityConfig.value = { resolutionOptions: ['2K', '4K'] }

    render(
      <Toolbar.Root>
        <StudioResolutionPopover />
      </Toolbar.Root>,
    )

    expect(
      screen.getByRole('radio', { name: 'resolutionOption.2K' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('quality')).not.toBeInTheDocument()
  })
})
