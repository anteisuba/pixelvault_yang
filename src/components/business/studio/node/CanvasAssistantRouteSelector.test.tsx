import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS } from '@/constants/node-studio'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { CanvasAssistantRouteSelector } from '@/components/business/studio/node/CanvasAssistantRouteSelector'

const mockUseApiKeysContext = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.values(params).join(':')}` : key,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => mockUseApiKeysContext(),
}))

vi.mock('@/components/business/studio/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

const onChange = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockUseApiKeysContext.mockReturnValue({
    keys: [
      {
        id: 'key-gemini',
        modelId: 'gemini-3.5-flash',
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
        label: 'Gemini route',
        maskedKey: 'AIza****',
        isActive: true,
        createdAt: new Date(),
      },
    ],
    isLoading: false,
    error: null,
    healthMap: {
      'key-gemini': 'available',
    },
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    verify: vi.fn(),
    refresh: vi.fn(),
  })
})

describe('CanvasAssistantRouteSelector', () => {
  it('selects a saved assistant route', () => {
    render(
      <CanvasAssistantRouteSelector
        value={{ optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('triggerLabel'))
    fireEvent.click(screen.getByText('Gemini route'))

    expect(onChange).toHaveBeenCalledWith({
      optionId: 'node-studio-assistant:key:key-gemini',
      apiKeyId: 'key-gemini',
    })
  })

  it('can switch back to automatic routing', () => {
    render(
      <CanvasAssistantRouteSelector
        value={{
          optionId: 'node-studio-assistant:key:key-gemini',
          apiKeyId: 'key-gemini',
        }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('triggerLabel'))
    fireEvent.click(screen.getByText('autoLabel'))

    expect(onChange).toHaveBeenCalledWith({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
  })
})
