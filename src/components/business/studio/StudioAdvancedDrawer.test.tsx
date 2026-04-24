import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioAdvancedDrawer } from './StudioAdvancedDrawer'

const mockContext = vi.hoisted(() => ({
  dispatch: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/AdvancedSettings', () => ({
  AdvancedSettings: () => <div data-testid="advanced-settings" />,
}))

vi.mock('./StudioQuickRouteSelector', () => ({
  StudioQuickRouteSelector: () => <div data-testid="route-selector" />,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      outputType: 'image',
      workflowMode: 'quick',
      advancedParams: {},
    },
    dispatch: mockContext.dispatch,
  }),
  useStudioData: () => ({
    styles: { activeCard: null },
    imageUpload: { referenceImages: [] },
  }),
  useStudioGen: () => ({
    isGenerating: false,
  }),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    selectedModel: {
      adapterType: 'fal',
      modelId: 'sdxl',
    },
  }),
}))

describe('StudioAdvancedDrawer', () => {
  beforeEach(() => {
    mockContext.dispatch.mockClear()
  })

  it('renders mode, route/model, and provider sections', () => {
    render(<StudioAdvancedDrawer open onOpenChange={vi.fn()} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('sections.mode')).toBeInTheDocument()
    expect(screen.getByText('sections.routeModel')).toBeInTheDocument()
    expect(screen.getByText('sections.provider')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'quickMode' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'cardMode' })).toBeInTheDocument()
    expect(screen.getByTestId('route-selector')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'openModelSelector' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('advanced-settings')).toBeInTheDocument()
  })

  it('dispatches workflow mode changes from the mode section', () => {
    render(<StudioAdvancedDrawer open onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'cardMode' }))

    expect(mockContext.dispatch).toHaveBeenCalledWith({
      type: 'SET_WORKFLOW_MODE',
      payload: 'card',
    })
  })

  it('calls onOpenChange when closed', () => {
    const onOpenChange = vi.fn()
    render(<StudioAdvancedDrawer open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
