import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// jsdom doesn't ship ResizeObserver or Element.scrollIntoView;
// cmdk (used by <Command/>) needs both.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(() => ({
    keys: [],
    healthMap: {},
    isLoading: false,
  })),
}))

import { BaseModelPickerPanel } from '@/components/business/studio-shared/pickers/BaseModelPickerPanel'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'

function makeOption(over: Partial<StudioModelOption>): StudioModelOption {
  return {
    optionId: over.optionId ?? 'opt-1',
    modelId: over.modelId ?? 'model-1',
    adapterType: over.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    providerConfig:
      over.providerConfig ?? getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    requestCount: over.requestCount ?? 1,
    isBuiltIn: over.isBuiltIn ?? false,
    freeTier: over.freeTier,
    sourceType: over.sourceType ?? 'workspace',
    keyId: over.keyId,
    keyLabel: over.keyLabel,
    maskedKey: over.maskedKey,
  }
}

describe('BaseModelPickerPanel', () => {
  it('renders trigger with custom empty label when nothing selected', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        triggerEmptyLabel="Pick a model"
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Pick a model' }),
    ).toBeInTheDocument()
  })

  it('shows the selected option label in the trigger', () => {
    const opt = makeOption({
      optionId: 'opt-saved',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'My personal key',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-saved"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('My personal key')).toBeInTheDocument()
  })

  it('shows model label when no keyLabel (workspace/locked option selected)', () => {
    const opt = makeOption({
      optionId: 'opt-workspace',
      modelId: 'flux-pro',
      sourceType: 'workspace',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-workspace"
        onChange={vi.fn()}
      />,
    )
    // tModels('flux-pro.label') under the mock returns 'Models.flux-pro.label'
    expect(screen.getByText(/flux-pro/)).toBeInTheDocument()
  })

  it('disables trigger when disabled prop is set', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('renders three groups when options span saved / platform / locked', () => {
    const saved = makeOption({
      optionId: 'opt-saved',
      sourceType: 'saved',
      keyId: 'k1',
    })
    const platform = makeOption({
      optionId: 'opt-platform',
      sourceType: 'workspace',
      freeTier: true,
    })
    const locked = makeOption({
      optionId: 'opt-locked',
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[saved, platform, locked]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.configuredKeys')).toBeInTheDocument()
    expect(screen.getByText('QuickSetup.platformQuota')).toBeInTheDocument()
    expect(screen.getByText('QuickSetup.needsKey')).toBeInTheDocument()
  })

  it('omits a group when its bucket is empty', () => {
    const platform = makeOption({
      optionId: 'opt-platform',
      sourceType: 'workspace',
      freeTier: true,
    })
    render(
      <BaseModelPickerPanel
        options={[platform]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(
      screen.queryByText('QuickSetup.configuredKeys'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('QuickSetup.platformQuota')).toBeInTheDocument()
    expect(screen.queryByText('QuickSetup.needsKey')).not.toBeInTheDocument()
  })

  it('hides search input when enableSearch=false', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        enableSearch={false}
        searchPlaceholder="Search models"
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(
      screen.queryByPlaceholderText('Search models'),
    ).not.toBeInTheDocument()
  })

  it('shows search input by default', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        searchPlaceholder="Search now"
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByPlaceholderText('Search now')).toBeInTheDocument()
  })
})
