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
    displayLabel: over.displayLabel,
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
  it('uses the Studio scrollbar treatment for the model list', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        triggerEmptyLabel="Pick a model"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pick a model' }))

    expect(screen.getByRole('dialog')).toHaveClass('studio-scrollbar')
  })

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

  it('shows the selected model label in the trigger by default', () => {
    const opt = makeOption({
      optionId: 'opt-saved',
      modelId: 'gpt-image-2',
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
    expect(screen.getByText(/openaiGptImage2/)).toBeInTheDocument()
    expect(screen.queryByText('My personal key')).not.toBeInTheDocument()
  })

  it('can use key label as the primary label when requested', () => {
    const opt = makeOption({
      optionId: 'opt-saved',
      modelId: 'gpt-image-2',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'My personal key',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-saved"
        onChange={vi.fn()}
        savedOptionLabelMode="key"
      />,
    )
    expect(screen.getByText('My personal key')).toBeInTheDocument()
  })

  it('can use model label as the primary label for saved LLM routes', () => {
    const opt = makeOption({
      optionId: 'opt-llm',
      modelId: 'gpt-5.4-mini',
      displayLabel: 'OpenAI GPT-5.4 Mini',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'seeddance-gpt',
    })

    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-llm"
        onChange={vi.fn()}
        savedOptionLabelMode="model"
      />,
    )

    expect(screen.getByText('OpenAI GPT-5.4 Mini')).toBeInTheDocument()
    expect(screen.queryByText('seeddance-gpt')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('seeddance-gpt · OpenAI')).toBeInTheDocument()
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

  it('shows saved + platform but hides locked in step 2 of a configured provider (select-only)', () => {
    // All three share the default OPENAI adapter → single provider → the
    // picker auto-skips step 1 into the provider's model list (step 2). Step 2
    // is select-only: locked/needs-key models are hidden because the provider
    // already has a usable (saved) route. Configuring keys happens at step 1.
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
    expect(screen.queryByText('QuickSetup.needsKey')).not.toBeInTheDocument()
  })

  it('falls back to showing locked models when the provider has no usable route', () => {
    // A single provider whose only model is locked still surfaces it (as a
    // fallback) so the list is never silently empty.
    const locked = makeOption({
      optionId: 'opt-locked',
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[locked]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.needsKey')).toBeInTheDocument()
  })

  it('drills into an unconfigured (needs-key) provider from step 1, showing its locked models', () => {
    // Two distinct providers → step 1 (provider list) is shown, not auto-skipped.
    // The DEEPSEEK provider is entirely unconfigured: its only option is neither
    // a saved key nor a free-tier platform route, so it renders as "needs key".
    // Clicking that provider row must drill into step 2 and surface its locked
    // model — not stay on the provider list or dismiss the popover.
    const configured = makeOption({
      optionId: 'opt-openai-saved',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
      sourceType: 'saved',
      keyId: 'k1',
    })
    const unconfigured = makeOption({
      optionId: 'opt-deepseek-locked',
      modelId: 'deepseek-model',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.DEEPSEEK),
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[configured, unconfigured]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    // Step 1: provider rows are shown; the provider's model itself is not yet
    // listed (the model groups belong to step 2). The provider row carries its
    // own "needs key" badge, so that text alone doesn't distinguish the steps —
    // the model id does.
    const deepseekRow = screen.getByText(
      getDefaultProviderConfig(AI_ADAPTER_TYPES.DEEPSEEK).label,
    )
    expect(screen.queryByText(/deepseek-model/)).not.toBeInTheDocument()

    // Drill into the unconfigured provider.
    fireEvent.click(deepseekRow)

    // Step 2: the popover stayed open and now lists the provider's locked model
    // under the needs-key group (the provider had no usable route). The locked
    // model id only renders in step 2, so its presence proves the drill-in. The
    // needs-key *heading* coexists with the exiting step-1 row's own needs-key
    // badge during the cross-fade (popLayout keeps the outgoing view mounted),
    // so it can match more than once — assert at least one is present.
    expect(screen.getAllByText('QuickSetup.needsKey').length).toBeGreaterThan(0)
    expect(screen.getByText(/deepseek-model/)).toBeInTheDocument()
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

  it('uses the popover content as the scroll container', () => {
    render(
      <BaseModelPickerPanel
        options={[
          makeOption({ optionId: 'opt-1' }),
          makeOption({ optionId: 'opt-2' }),
        ]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    const content = document.querySelector('[data-slot="popover-content"]')
    const list = document.querySelector('[data-slot="command-list"]')

    expect(content).toHaveClass('overflow-y-auto')
    expect(content).toHaveClass('touch-pan-y')
    expect(list).toHaveClass('max-h-none')
    expect(list).toHaveClass('overflow-y-visible')
  })
})
