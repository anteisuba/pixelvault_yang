import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// jsdom doesn't ship ResizeObserver / Element.scrollIntoView; Radix Popover
// (used inside CanvasRoutePicker) needs both for its open/close lifecycle
// and inner scroll behavior.
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

vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: vi.fn(() => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  })),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))
vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: vi.fn(() => ({
    modelOptions: [],
    selectedModel: undefined,
  })),
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { CanvasRoutePicker } from '@/components/business/studio-shared/pickers/CanvasRoutePicker'
import { useLLMRoutePicker } from '@/hooks/use-llm-route-picker'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import type { LLMRouteOption } from '@/hooks/use-llm-route-picker'

function makeRoute(over: Partial<LLMRouteOption>): LLMRouteOption {
  return {
    optionId: over.optionId ?? 'opt-1',
    apiKeyId: over.apiKeyId ?? 'k1',
    adapterType: over.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    modelId: over.modelId,
    label: over.label ?? 'OpenAI',
    providerLabel: over.providerLabel ?? 'OpenAI',
    maskedKey: over.maskedKey,
    keyLabel: over.keyLabel,
    isSaved: over.isSaved ?? true,
  }
}

describe('CanvasRoutePicker dispatcher', () => {
  it('renders without crashing for each variant', () => {
    const cases = [
      <CanvasRoutePicker
        key="planner"
        variant="planner"
        value={null}
        onChange={vi.fn()}
      />,
      <CanvasRoutePicker
        key="assistant"
        variant="assistant"
        value={null}
        onChange={vi.fn()}
      />,
      <CanvasRoutePicker
        key="media-image"
        variant="media"
        mediaModality="image"
        value={null}
        onChange={vi.fn()}
      />,
      <CanvasRoutePicker
        key="media-video"
        variant="media"
        mediaModality="video"
        value={null}
        onChange={vi.fn()}
      />,
      <CanvasRoutePicker
        key="media-audio"
        variant="media"
        mediaModality="audio"
        value={null}
        onChange={vi.fn()}
      />,
    ]
    for (const node of cases) {
      const { unmount } = render(node)
      expect(screen.getByRole('button')).toBeInTheDocument()
      unmount()
    }
  })

  it('variant=planner subscribes to useLLMRoutePicker("planner")', () => {
    vi.mocked(useLLMRoutePicker).mockClear()
    render(
      <CanvasRoutePicker variant="planner" value={null} onChange={vi.fn()} />,
    )
    expect(useLLMRoutePicker).toHaveBeenCalledWith('planner')
  })

  it('variant=assistant subscribes to useLLMRoutePicker("assistant")', () => {
    vi.mocked(useLLMRoutePicker).mockClear()
    render(
      <CanvasRoutePicker variant="assistant" value={null} onChange={vi.fn()} />,
    )
    expect(useLLMRoutePicker).toHaveBeenCalledWith('assistant')
  })

  it('variant=media (image) routes to useImageModelOptions (via MainModelPicker)', () => {
    vi.mocked(useImageModelOptions).mockClear()
    vi.mocked(useLLMRoutePicker).mockClear()
    render(
      <CanvasRoutePicker
        variant="media"
        mediaModality="image"
        value={null}
        onChange={vi.fn()}
      />,
    )
    expect(useImageModelOptions).toHaveBeenCalledTimes(1)
    expect(useLLMRoutePicker).not.toHaveBeenCalled()
  })

  it('variant=media (video) routes to useVideoModelOptions', () => {
    vi.mocked(useVideoModelOptions).mockClear()
    render(
      <CanvasRoutePicker
        variant="media"
        mediaModality="video"
        value={null}
        onChange={vi.fn()}
      />,
    )
    expect(useVideoModelOptions).toHaveBeenCalledTimes(1)
  })

  it('variant=media (audio) routes to useAudioModelOptions', () => {
    vi.mocked(useAudioModelOptions).mockClear()
    render(
      <CanvasRoutePicker
        variant="media"
        mediaModality="audio"
        value={null}
        onChange={vi.fn()}
      />,
    )
    expect(useAudioModelOptions).toHaveBeenCalledTimes(1)
  })

  it('planner and assistant share the same useLLMRoutePicker hook (contract for D5)', () => {
    // D5 / IRON RULE: planner and assistant variants of CanvasRoutePicker
    // must both go through the same useLLMRoutePicker hook so the LLM
    // capability list stays unified across Node-canvas routes.
    vi.mocked(useLLMRoutePicker).mockClear()
    render(
      <>
        <CanvasRoutePicker variant="planner" value={null} onChange={vi.fn()} />
        <CanvasRoutePicker
          variant="assistant"
          value={null}
          onChange={vi.fn()}
        />
      </>,
    )
    const calls = vi.mocked(useLLMRoutePicker).mock.calls.map((c) => c[0])
    expect(calls).toContain('planner')
    expect(calls).toContain('assistant')
  })
})

describe('CanvasRoutePicker LLM variant — UI behavior', () => {
  it('shows badge text + tone when badge prop provided', () => {
    render(
      <CanvasRoutePicker
        variant="planner"
        value={null}
        onChange={vi.fn()}
        badge={{ text: 'Single Agent Key', tone: 'amber' }}
        triggerLabel="Planner Route"
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Single Agent Key')).toBeInTheDocument()
  })

  it('renders noticeDescription inside the popover header', () => {
    render(
      <CanvasRoutePicker
        variant="assistant"
        value={null}
        onChange={vi.fn()}
        triggerLabel="Assistant"
        noticeDescription="Auto-route prefers AI Gateway."
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(
      screen.getByText('Auto-route prefers AI Gateway.'),
    ).toBeInTheDocument()
  })

  it('clicking a saved route calls onChange with converted StudioModelOption', () => {
    const saved = makeRoute({
      optionId: 'llm-route:planner:key:k1',
      apiKeyId: 'k1',
      keyLabel: 'My OpenAI',
      modelId: 'gpt-4o-mini',
    })
    vi.mocked(useLLMRoutePicker).mockReturnValue({
      savedRoutes: [saved],
      lockedRoutes: [],
      allRoutes: [saved],
      healthMap: { k1: 'available' },
    })
    const onChange = vi.fn()
    render(
      <CanvasRoutePicker variant="planner" value={null} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('My OpenAI'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const arg = onChange.mock.calls[0][0]
    expect(arg.optionId).toBe('llm-route:planner:key:k1')
    expect(arg.keyId).toBe('k1')
    expect(arg.modelId).toBe('gpt-4o-mini')
    expect(arg.sourceType).toBe('saved')
  })

  it('clicking a locked route calls onRequestSetup, not onChange', () => {
    const locked = makeRoute({
      optionId: 'llm-route:planner:setup:gpt-4o',
      apiKeyId: null,
      isSaved: false,
      label: 'OpenAI',
      modelId: 'gpt-4o',
    })
    vi.mocked(useLLMRoutePicker).mockReturnValue({
      savedRoutes: [],
      lockedRoutes: [locked],
      allRoutes: [locked],
      healthMap: {},
    })
    const onChange = vi.fn()
    const onRequestSetup = vi.fn()
    render(
      <CanvasRoutePicker
        variant="planner"
        value={null}
        onChange={onChange}
        onRequestSetup={onRequestSetup}
        addKeyLabel="Add API Key"
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    // OpenAI label appears twice (route name + provider label under "Add Key")
    // Just click the first match — it's the locked entry.
    const labels = screen.getAllByText('OpenAI')
    fireEvent.click(labels[0])
    expect(onRequestSetup).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled prop disables the trigger', () => {
    render(
      <CanvasRoutePicker
        variant="planner"
        value={null}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
